// realtime.js - Real-time Firestore listeners for subjects and tasks

import { db } from './firebase.js';
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Global variables to store listeners (for cleanup if needed)
let subjectsListener = null;

// ---------------------------------------------------------------------------
// setupRealtimeSubjects
// Listens to the single course document: db > "subjects" > courseId
// This matches how app.js saves data via setDoc(doc(db, "subjects", courseId))
// ---------------------------------------------------------------------------
export function setupRealtimeSubjects(courseId, onSubjectsUpdate, onError) {
    if (!courseId) {
        console.error('Course ID required for real-time subjects');
        return;
    }

    // Unsubscribe previous listener if one exists
    if (subjectsListener) {
        subjectsListener();
        subjectsListener = null;
    }

    const docRef = doc(db, 'subjects', courseId);

    subjectsListener = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            const subjects = docSnap.data().subjects || [];
            console.log('Real-time subjects update:', subjects);
            onSubjectsUpdate(subjects);
        } else {
            console.warn('No subjects document found for course:', courseId);
            onSubjectsUpdate([]);
        }
    }, (error) => {
        console.error('Real-time subjects error:', error);
        if (onError) onError(error);
    });

    return subjectsListener;
}

// ---------------------------------------------------------------------------
// setupRealtimeTasks
// Because tasks are embedded inside each subject object (not a subcollection),
// we listen to the same course document and extract tasks for the given subjectId.
// ---------------------------------------------------------------------------
export function setupRealtimeTasks(subjectId, onTasksUpdate, onError) {
    if (!subjectId) {
        console.error('Subject ID required for real-time tasks');
        return;
    }

    // We need the courseId to know which document to listen to.
    // Retrieve it from localStorage (set during login).
    const userData = JSON.parse(localStorage.getItem('userData'));
    if (!userData || !userData.course) {
        console.warn('No course found in userData — skipping task listener for subject:', subjectId);
        return;
    }

    const courseId = userData.course;
    const docRef = doc(db, 'subjects', courseId);

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            const subjects = docSnap.data().subjects || [];
            const subject = subjects.find(s => s.id === subjectId);
            const tasks = subject ? (subject.tasks || []) : [];
            console.log(`Real-time tasks update for subject ${subjectId}:`, tasks);
            onTasksUpdate(subjectId, tasks);
        }
    }, (error) => {
        console.error(`Real-time tasks error for subject ${subjectId}:`, error);
        if (onError) onError(error);
    });

    return unsubscribe;
}

// ---------------------------------------------------------------------------
// stopRealtimeListeners — stop the subjects listener
// (Individual task listeners are unsubscribe handles returned from
//  setupRealtimeTasks; call them directly or use stopTaskListeners below.)
// ---------------------------------------------------------------------------
export function stopRealtimeListeners() {
    if (subjectsListener) {
        subjectsListener();
        subjectsListener = null;
    }
}

// ---------------------------------------------------------------------------
// stopTaskListeners
// app.js calls this before re-building task listeners on a realtime update.
// Because task listeners in this architecture are just views into the same
// course document, we don't need to track them separately — but we keep this
// export so the existing app.js import doesn't break.
// ---------------------------------------------------------------------------
export function stopTaskListeners() {
    // No-op: task listeners share the same document listener as subjects.
    // Individual unsubscribe handles returned by setupRealtimeTasks can be
    // called directly if you need to stop a specific one.
    console.log('stopTaskListeners called (no-op in embedded-data architecture)');
}