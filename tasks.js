// tasks.js - CRUD operations for tasks with role-based access and file uploads

import { db, auth } from './firebase.js';
import { supabase } from './supabase.js';
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  addDoc,
  collection,
  serverTimestamp,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function getCurrentUserRole() {
  const userData = JSON.parse(localStorage.getItem('userData'));
  return userData ? userData.role : null;
}

function getCurrentUserId() {
  const user = auth.currentUser;
  return user ? user.uid : null;
}

function getCurrentUserData() {
  return JSON.parse(localStorage.getItem('userData')) || null;
}

// FIX: Centralised Supabase upload — returns public URL or throws.
// Uses upsert:true so re-submissions overwrite the previous file cleanly.
async function uploadFileToSupabase(file, path) {
  console.log('Uploading to Supabase:', path + file.name);
  const { error } = await supabase.storage
    .from('files')
    .upload(path + file.name, file, { upsert: true });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data: urlData } = supabase.storage
    .from('files')
    .getPublicUrl(path + file.name);

  if (!urlData?.publicUrl) throw new Error('Failed to get public URL');
  console.log('Upload OK, URL:', urlData.publicUrl);
  return urlData.publicUrl;
}

// FIX: Resolve the Firestore course document ID for the current user.
// Priority order:
//   1. userData.course (fastest — already known)
//   2. Scan all /subjects docs and match by subject ID
//   3. Scan all /subjects docs and match by subject name + teacher
// Once found, the courseId is cached back into localStorage so future
// calls skip the scan.
async function resolveCourseId() {
  const userData = getCurrentUserData();
  if (userData?.course) return userData.course;

  console.warn('resolveCourseId: userData.course missing — scanning Firestore...');
  const snap = await getDocs(collection(db, 'subjects'));
  const localSubjects = JSON.parse(localStorage.getItem('subjects')) || [];
  let foundId = null;

  // Pass 1: match by subject id
  snap.forEach(d => {
    if (foundId) return;
    const cs = d.data()?.subjects || [];
    if (cs.some(c => localSubjects.some(l => l.id && l.id === c.id))) foundId = d.id;
  });

  // Pass 2: match by name + teacher
  if (!foundId) {
    snap.forEach(d => {
      if (foundId) return;
      const cs = d.data()?.subjects || [];
      for (const c of cs) {
        for (const l of localSubjects) {
          if (!l.name || !c.name) continue;
          if (
            l.name.trim().toLowerCase() === c.name.trim().toLowerCase() &&
            (l.teacher || '').trim().toLowerCase() === (c.teacher || '').trim().toLowerCase()
          ) { foundId = d.id; break; }
        }
        if (foundId) break;
      }
    });
  }

  if (foundId && userData) {
    // Cache so future calls are instant
    userData.course = foundId;
    localStorage.setItem('userData', JSON.stringify(userData));
    console.log('resolveCourseId: found and cached courseId:', foundId);
  }

  return foundId;
}

// FIX: Read the full subjects array from Firestore for a given courseId.
async function getSubjectsFromFirestore(courseId) {
  const snap = await getDoc(doc(db, 'subjects', courseId));
  if (!snap.exists()) return null;
  return snap.data().subjects || [];
}

// FIX: Write the full subjects array back to Firestore.
async function saveSubjectsToFirestore(courseId, subjects) {
  await setDoc(doc(db, 'subjects', courseId), {
    subjects,
    lastUpdated: serverTimestamp()
  });
}

// ---------------------------------------------------------------------------
// CREATE TASK (Instructor only)
// ---------------------------------------------------------------------------
export async function createTask(subjectId, taskData) {
  if (getCurrentUserRole() !== 'instructor') throw new Error('Only instructors can create tasks');
  const userId = getCurrentUserId();
  if (!userId) throw new Error('User not authenticated');

  try {
    let fileUrl = null;
    if (taskData.file) {
      fileUrl = await uploadFileToSupabase(taskData.file, `subjects/${subjectId}/tasks/`);
    }

    // FIX: tasks.js was adding to a separate subcollection (subjects/{id}/tasks/{taskId}).
    // script.js stores tasks inside the subjects array document instead.
    // We now write to the same place script.js reads from so they stay in sync.
    const courseId = await resolveCourseId();
    if (!courseId) throw new Error('Could not determine course ID — task not saved.');

    const allSubjects = await getSubjectsFromFirestore(courseId);
    if (!allSubjects) throw new Error('Subject document not found in Firestore.');

    const subIndex = allSubjects.findIndex(s => s.id === subjectId);
    if (subIndex === -1) throw new Error(`Subject ${subjectId} not found in course ${courseId}.`);

    const newTask = {
      id: Date.now().toString(),
      title: taskData.title,
      description: taskData.description || '',
      dueDate: taskData.dueDate,
      priority: taskData.priority || 'medium',
      status: 'pending',
      createdBy: userId,
      createdAt: new Date().toISOString(),
      fileName: taskData.file ? taskData.file.name : null,
      fileUrl,
      submissions: []
    };

    allSubjects[subIndex].tasks = [...(allSubjects[subIndex].tasks || []), newTask];
    await saveSubjectsToFirestore(courseId, allSubjects);

    // Keep localStorage in sync
    localStorage.setItem('subjects', JSON.stringify(allSubjects));

    console.log('Task created:', newTask.id);
    return newTask.id;
  } catch (error) {
    console.error('Error creating task:', error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// UPDATE TASK (Instructor only)
// ---------------------------------------------------------------------------
export async function updateTask(subjectId, taskId, taskData) {
  if (getCurrentUserRole() !== 'instructor') throw new Error('Only instructors can update tasks');

  try {
    const courseId = await resolveCourseId();
    if (!courseId) throw new Error('Could not determine course ID.');

    const allSubjects = await getSubjectsFromFirestore(courseId);
    if (!allSubjects) throw new Error('Subject document not found.');

    const subIndex = allSubjects.findIndex(s => s.id === subjectId);
    if (subIndex === -1) throw new Error(`Subject ${subjectId} not found.`);

    const taskIndex = allSubjects[subIndex].tasks?.findIndex(t => t.id === taskId);
    if (taskIndex === -1 || taskIndex === undefined) throw new Error(`Task ${taskId} not found.`);

    const existing = allSubjects[subIndex].tasks[taskIndex];
    let fileUrl = existing.fileUrl;
    let fileName = existing.fileName;

    if (taskData.file) {
      fileUrl = await uploadFileToSupabase(taskData.file, `subjects/${subjectId}/tasks/`);
      fileName = taskData.file.name;
    }

    allSubjects[subIndex].tasks[taskIndex] = {
      ...existing,
      title: taskData.title,
      description: taskData.description || '',
      dueDate: taskData.dueDate,
      priority: taskData.priority || 'medium',
      status: taskData.status || existing.status,
      fileName,
      fileUrl,
      updatedAt: new Date().toISOString()
    };

    await saveSubjectsToFirestore(courseId, allSubjects);
    localStorage.setItem('subjects', JSON.stringify(allSubjects));
    console.log('Task updated:', taskId);
  } catch (error) {
    console.error('Error updating task:', error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// DELETE TASK (Instructor only)
// ---------------------------------------------------------------------------
export async function deleteTask(subjectId, taskId) {
  if (getCurrentUserRole() !== 'instructor') throw new Error('Only instructors can delete tasks');

  try {
    const courseId = await resolveCourseId();
    if (!courseId) throw new Error('Could not determine course ID.');

    const allSubjects = await getSubjectsFromFirestore(courseId);
    if (!allSubjects) throw new Error('Subject document not found.');

    const subIndex = allSubjects.findIndex(s => s.id === subjectId);
    if (subIndex === -1) throw new Error(`Subject ${subjectId} not found.`);

    allSubjects[subIndex].tasks = (allSubjects[subIndex].tasks || []).filter(t => t.id !== taskId);
    await saveSubjectsToFirestore(courseId, allSubjects);
    localStorage.setItem('subjects', JSON.stringify(allSubjects));
    console.log('Task deleted:', taskId);
  } catch (error) {
    console.error('Error deleting task:', error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// SUBMIT TASK FILE (Student only)
// FIX: Now writes into the embedded subjects array (matching script.js storage
// pattern) instead of a separate subcollection. Also replaces any prior
// submission by the same student rather than appending a duplicate.
// ---------------------------------------------------------------------------
export async function submitTaskSubmission(subjectId, taskId, file, note = '') {
  if (getCurrentUserRole() !== 'student') throw new Error('Only students can submit task files');

  const userId = getCurrentUserId();
  if (!userId) throw new Error('User not authenticated');

  const userData = getCurrentUserData();
  if (!userData?.course) throw new Error('Your account has no course assigned. Contact your instructor.');

  try {
    const fileUrl = await uploadFileToSupabase(
      file,
      `subjects/${subjectId}/tasks/${taskId}/submissions/${userId}/`
    );

    const allSubjects = await getSubjectsFromFirestore(userData.course);
    if (!allSubjects) throw new Error('Subject document not found.');

    const subIndex = allSubjects.findIndex(s => s.id === subjectId);
    if (subIndex === -1) throw new Error(`Subject ${subjectId} not found.`);

    const taskIndex = allSubjects[subIndex].tasks?.findIndex(t => t.id === taskId);
    if (taskIndex === -1 || taskIndex === undefined) throw new Error(`Task ${taskId} not found.`);

    const task = allSubjects[subIndex].tasks[taskIndex];
    if (!task.submissions) task.submissions = [];

    // FIX: Replace prior submission from this student so instructor sees only one entry
    task.submissions = task.submissions.filter(s => s.studentId !== userId);
    task.submissions.push({
      studentId: userId,
      studentName: userData.name || userId,
      fileName: file.name,
      fileUrl,
      note,
      submittedAt: new Date().toISOString(),
      score: undefined
    });

    await saveSubjectsToFirestore(userData.course, allSubjects);

    // Keep localStorage in sync so the UI updates immediately
    localStorage.setItem('subjects', JSON.stringify(allSubjects));

    console.log('Task submission saved for task:', taskId);
    return fileUrl;
  } catch (error) {
    console.error('Error submitting task:', error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// SUBMIT ASSIGNMENT FILE (Student only)
// FIX: Same pattern as submitTaskSubmission — writes to the embedded array.
// ---------------------------------------------------------------------------
export async function submitAssignmentSubmission(subjectId, assignmentId, file, note = '') {
  if (getCurrentUserRole() !== 'student') throw new Error('Only students can submit assignments');

  const userId = getCurrentUserId();
  if (!userId) throw new Error('User not authenticated');

  const userData = getCurrentUserData();
  if (!userData?.course) throw new Error('Your account has no course assigned. Contact your instructor.');

  try {
    const fileUrl = await uploadFileToSupabase(
      file,
      `subjects/${subjectId}/assignments/${assignmentId}/submissions/${userId}/`
    );

    const allSubjects = await getSubjectsFromFirestore(userData.course);
    if (!allSubjects) throw new Error('Subject document not found.');

    const subIndex = allSubjects.findIndex(s => s.id === subjectId);
    if (subIndex === -1) throw new Error(`Subject ${subjectId} not found.`);

    const assignIndex = allSubjects[subIndex].assignments?.findIndex(a => a.id === assignmentId);
    if (assignIndex === -1 || assignIndex === undefined) throw new Error(`Assignment ${assignmentId} not found.`);

    const assignment = allSubjects[subIndex].assignments[assignIndex];
    if (!assignment.submissions) assignment.submissions = [];

    assignment.submissions = assignment.submissions.filter(s => s.studentId !== userId);
    assignment.submissions.push({
      studentId: userId,
      studentName: userData.name || userId,
      fileName: file.name,
      fileUrl,
      note,
      submittedAt: new Date().toISOString(),
      score: undefined
    });

    await saveSubjectsToFirestore(userData.course, allSubjects);
    localStorage.setItem('subjects', JSON.stringify(allSubjects));

    console.log('Assignment submission saved for assignment:', assignmentId);
    return fileUrl;
  } catch (error) {
    console.error('Error submitting assignment:', error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// SCORE A SUBMISSION (Instructor only)
// Works for both tasks and assignments.
// type: 'task' | 'assignment'
// ---------------------------------------------------------------------------
export async function scoreSubmission(subjectId, itemId, studentId, score, type = 'task') {
  if (getCurrentUserRole() !== 'instructor') throw new Error('Only instructors can score submissions');

  try {
    const courseId = await resolveCourseId();
    if (!courseId) throw new Error('Could not determine course ID.');

    const allSubjects = await getSubjectsFromFirestore(courseId);
    if (!allSubjects) throw new Error('Subject document not found.');

    const subIndex = allSubjects.findIndex(s => s.id === subjectId);
    if (subIndex === -1) throw new Error(`Subject ${subjectId} not found.`);

    const arrayKey = type === 'task' ? 'tasks' : 'assignments';
    const itemIndex = allSubjects[subIndex][arrayKey]?.findIndex(t => t.id === itemId);
    if (itemIndex === -1 || itemIndex === undefined) throw new Error(`${type} ${itemId} not found.`);

    const item = allSubjects[subIndex][arrayKey][itemIndex];
    const submissionIndex = (item.submissions || []).findIndex(s => s.studentId === studentId);
    if (submissionIndex === -1) throw new Error(`No submission found for student ${studentId}.`);

    allSubjects[subIndex][arrayKey][itemIndex].submissions[submissionIndex].score = score;

    await saveSubjectsToFirestore(courseId, allSubjects);
    localStorage.setItem('subjects', JSON.stringify(allSubjects));
    console.log(`Score ${score} saved for student ${studentId} on ${type} ${itemId}`);
  } catch (error) {
    console.error('Error scoring submission:', error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// GET A SINGLE TASK (for viewing / display)
// ---------------------------------------------------------------------------
export async function getTask(subjectId, taskId) {
  try {
    const courseId = await resolveCourseId();
    if (!courseId) throw new Error('Could not determine course ID.');

    const allSubjects = await getSubjectsFromFirestore(courseId);
    if (!allSubjects) throw new Error('Subject document not found.');

    const subject = allSubjects.find(s => s.id === subjectId);
    if (!subject) throw new Error(`Subject ${subjectId} not found.`);

    const task = (subject.tasks || []).find(t => t.id === taskId);
    if (!task) throw new Error(`Task ${taskId} not found.`);

    return task;
  } catch (error) {
    console.error('Error getting task:', error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// GET ALL TASKS for a subject (fallback — prefer realtime listeners)
// ---------------------------------------------------------------------------
export async function getTasks(subjectId) {
  console.warn('getTasks: prefer realtime listeners. This is a one-time fallback fetch.');
  try {
    const courseId = await resolveCourseId();
    if (!courseId) return [];

    const allSubjects = await getSubjectsFromFirestore(courseId);
    const subject = (allSubjects || []).find(s => s.id === subjectId);
    return subject ? (subject.tasks || []) : [];
  } catch (error) {
    console.error('Error getting tasks:', error);
    return [];
  }
}