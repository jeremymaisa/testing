// =========================
// IMPORT FIREBASE AUTH & SUPABASE
// =========================
import { auth } from './firebase.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { supabase } from './supabase.js';
import { setupRealtimeTasks, stopTaskListeners } from './realtime.js';

const db = getFirestore();

let subjects = JSON.parse(localStorage.getItem('subjects')) || [
  {
    id: '1',
    name: "Mathematics",
    teacher: "Mr. Anderson",
    time: "08:00 AM - 09:30 AM",
    description: "Advanced Calculus and Algebra",
    tasks: [
      {
        id: 't1',
        title: "Complete Chapter 5 Exercises",
        dueDate: "2023-10-15",
        priority: "high",
        status: "pending",
        description: "Solve all exercises in Chapter 5",
        file: null,
        fileUrl: null,
        submissions: []
      }
    ],
    assignments: [
      {
        id: 'a1',
        title: "Research Paper",
        dueDate: "2023-10-20",
        points: 100,
        status: "pending",
        instructions: "Write a 5-page research paper on Calculus",
        file: null,
        fileUrl: null,
        submissions: []
      }
    ],
    lessons: [],
    quizzes: []
  },
  {
    id: '2',
    name: "Physics",
    teacher: "Ms. Curie",
    time: "10:00 AM - 11:30 AM",
    description: "Fundamentals of Physics",
    tasks: [],
    assignments: [],
    lessons: [],
    quizzes: []
  },
  {
    id: '3',
    name: "Computer Science",
    teacher: "Mr. Turing",
    time: "01:00 PM - 02:30 PM",
    description: "Algorithms and Data Structures",
    tasks: [],
    assignments: [],
    lessons: [],
    quizzes: []
  }
];

// =========================
// TOAST NOTIFICATION
// =========================
function showToast(message, type = 'success') {
  const existing = document.querySelector('.darkboard-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `darkboard-toast toast-${type}`;
  toast.innerHTML = `
    <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
    <span>${message}</span>
  `;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-visible'));
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// =========================
// FILE UPLOAD TO SUPABASE
// =========================
async function uploadFileToSupabase(file, path) {
  try {
    const { data, error } = await supabase.storage
      .from('files')
      .upload(path + file.name, file, { upsert: true });

    if (error) throw new Error(`Upload failed: ${error.message}`);

    const { data: urlData } = supabase.storage
      .from('files')
      .getPublicUrl(path + file.name);

    if (!urlData?.publicUrl) throw new Error('Failed to get public URL');
    return urlData.publicUrl;
  } catch (error) {
    console.error('Upload error:', error);
    showToast(`File upload failed: ${error.message}`, 'error');
    return null;
  }
}

// =========================
// THEME TOGGLE
// =========================
function initializeTheme() {
  const theme = localStorage.getItem("theme") || "dark";
  applyTheme(theme);
}

function applyTheme(theme) {
  if (theme === "light") document.body.classList.add("light-mode");
  else document.body.classList.remove("light-mode");
  localStorage.setItem("theme", theme);

  [
    document.getElementById("darkModeBtn"),
    document.getElementById("lightModeBtn"),
    document.getElementById("darkThemeBtn"),
    document.getElementById("lightThemeBtn")
  ].forEach(btn => { if (btn) btn.classList.remove("active"); });

  if (theme === "dark") {
    document.getElementById("darkModeBtn")?.classList.add("active");
    document.getElementById("darkThemeBtn")?.classList.add("active");
  } else {
    document.getElementById("lightModeBtn")?.classList.add("active");
    document.getElementById("lightThemeBtn")?.classList.add("active");
  }
}

// =========================
// LOGIN / SIGNUP MESSAGES
// =========================
function setMessage(id, msg, success = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.color = success ? "#51cf66" : "#ff6b6b";
}

// =========================
// LOGIN
// =========================
function initializeLogin() {
  const loginForm = document.getElementById("loginForm");
  loginForm?.addEventListener("submit", async e => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
    if (!email || !password) { setMessage("loginError", "Please fill in all fields"); return; }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      let userDoc = await getDoc(doc(db, "users", user.uid));
      let userRole = 'student', userCourse = '';
      if (userDoc.exists()) {
        userRole = userDoc.data().role || 'student';
        userCourse = userDoc.data().course || '';
      } else {
        userDoc = await getDoc(doc(db, "students", user.uid));
        if (userDoc.exists()) {
          userRole = userDoc.data().role || 'student';
          userCourse = userDoc.data().course || '';
        }
      }

      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("userData", JSON.stringify({
        id: user.uid,
        name: user.displayName || email,
        role: userRole,
        course: userCourse
      }));
      setMessage("loginSuccess", "Login successful! Redirecting...", true);
      setTimeout(() => location.href = "index.html", 1200);
    } catch (err) {
      setMessage("loginError", err.message);
    }
  });
}

// =========================
// SIGNUP
// =========================
function initializeSignup() {
  const signupForm = document.getElementById("signupForm");
  signupForm?.addEventListener("submit", async e => {
    e.preventDefault();
    const fullName = document.getElementById("fullName").value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const password = document.getElementById("signupPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    const phone = document.getElementById("phone").value.trim();
    const course = document.getElementById("course").value.trim();
    const role = document.querySelector('input[name="role"]:checked').value;
    const accessCode = document.getElementById("accessCode").value.trim();

    if (!fullName || !email || !password || !confirmPassword || !course) {
      setMessage("signupMessage", "Please fill in all required fields"); return;
    }
    if (password !== confirmPassword) {
      setMessage("signupMessage", "Passwords do not match"); return;
    }
    if (password.length < 6) {
      setMessage("signupMessage", "Password must be at least 6 characters"); return;
    }
    if (role === "instructor" && accessCode !== "INSTRUCTOR2026") {
      setMessage("signupMessage", "Invalid access code for Instructor"); return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      await updateProfile(user, { displayName: fullName });
      await setDoc(doc(db, "users", user.uid), {
        fullName, email, phone, course, role, createdAt: serverTimestamp()
      });
      setMessage("signupMessage", "Account created successfully! Redirecting...", true);
      setTimeout(() => window.location.href = "Login.html", 1500);
    } catch (err) {
      setMessage("signupMessage", err.message);
    }
  });
}

// =========================
// ROLE TOGGLE
// =========================
function initializeRoleToggle() {
  const roleRadios = document.querySelectorAll('input[name="role"]');
  const accessCodeGroup = document.getElementById('accessCodeGroup');
  roleRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (accessCodeGroup) {
        accessCodeGroup.style.display = radio.value === 'instructor' ? 'block' : 'none';
      }
    });
  });
}

// =========================
// PASSWORD TOGGLE
// =========================
function initializePasswordToggles() {
  function togglePassword(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.querySelector(`#${iconId} i`);
    if (!input || !icon) return;
    input.type = input.type === "password" ? "text" : "password";
    icon.classList.toggle("fa-eye-slash");
    icon.classList.toggle("fa-eye");
  }
  document.getElementById("togglePassword")?.addEventListener("click", () => togglePassword("password", "togglePassword"));
  document.getElementById("toggleSignupPassword")?.addEventListener("click", () => togglePassword("signupPassword", "toggleSignupPassword"));
  document.getElementById("toggleConfirmPassword")?.addEventListener("click", () => togglePassword("confirmPassword", "toggleConfirmPassword"));
}

// =========================
// DASHBOARD USER INFO
// =========================
function initializeDashboard() {
  const userData = JSON.parse(localStorage.getItem("userData"));
  if (!userData) return;
  const userNameEl = document.getElementById("headerUserName");
  const dashboardNameEl = document.getElementById("dashboardUserName");
  const greetingEl = document.getElementById("greetingMessage");
  if (userNameEl) userNameEl.textContent = userData.name;
  if (dashboardNameEl) dashboardNameEl.textContent = userData.name.split(" ")[0];
  if (greetingEl) {
    const hour = new Date().getHours();
    greetingEl.textContent = hour < 12 ? "Good morning 🌅" : hour < 17 ? "Good afternoon ☀️" : "Good evening 🌙";
  }
}

// =========================
// LOGOUT
// =========================
function logout(e) {
  if (e) e.preventDefault();
  localStorage.clear();
  location.href = "Login.html";
}

// =========================
// HELP PAGE
// =========================
function initializeHelp() {
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    if (!question) return;
    question.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      faqItems.forEach(i => i.classList.remove('active'));
      if (!isActive) item.classList.add('active');
    });
  });

  const contactForm = document.getElementById('helpContactForm');
  contactForm?.addEventListener('submit', e => {
    e.preventDefault();
    const btn = contactForm.querySelector('.btn-submit');
    const originalText = btn.textContent;
    btn.textContent = 'Message Sent!';
    btn.style.background = '#4ade80';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = '';
      contactForm.reset();
    }, 3000);
  });
}

// =========================
// SUBJECTS PAGE
// =========================
function initializeSubjects() {
  const listContainer = document.getElementById('subjectsList');
  const detailsContainer = document.getElementById('subjectDetailsPanel');
  const addBtn = document.getElementById('addSubjectBtn');
  const addModal = document.getElementById('addSubjectModal');
  const addForm = document.getElementById('addSubjectForm');
  const editModal = document.getElementById('editSubjectModal');
  const editForm = document.getElementById('editSubjectForm');
  const deleteBtn = document.getElementById('deleteSubjectBtn');

  if (!listContainer || !detailsContainer) return;

  const userData = JSON.parse(localStorage.getItem("userData"));
  const userRole = userData ? userData.role : 'student';

  // Hide add button for students
  if (userRole !== 'instructor' && addBtn) addBtn.style.display = 'none';

  // -------------------------
  // TASK LISTENERS
  // -------------------------
  function setupTaskListeners() {
    subjects.forEach((subject, index) => {
      if (subject.id) {
        setupRealtimeTasks(subject.id, (subjectId, tasks) => {
          const localSubject = subjects.find(s => s.id === subjectId);
          if (localSubject) {
            localSubject.tasks = tasks;
            const activeItem = document.querySelector('.subject-list-item.active');
            if (activeItem && parseInt(activeItem.dataset.index) === index) {
              renderSubjectDetails(index);
            }
          }
        });
      }
    });
  }

  // Load from Firestore if logged in
  if (userData?.course) {
    loadSubjectsFromFirestore(userData.course).then(() => {
      setupRealtimeSubjects(userData.course, updatedSubjects => {
        stopTaskListeners();
        subjects = updatedSubjects;
        saveSubjects(false);
        renderSubjects();
        const activeItem = document.querySelector('.subject-list-item.active');
        if (activeItem) renderSubjectDetails(activeItem.dataset.index);
        setupTaskListeners();
      });
      setupTaskListeners();
    });
  }

  // -------------------------
  // RENDER SUBJECTS LIST
  // -------------------------
  function renderSubjects() {
    listContainer.innerHTML = subjects.map((sub, index) => `
      <div class="subject-list-item" data-index="${index}">
        <h4>${sub.name}</h4>
        <p>${sub.teacher}</p>
      </div>
    `).join('');

    document.querySelectorAll('.subject-list-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.subject-list-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        renderSubjectDetails(item.dataset.index);
      });
    });
  }

  // -------------------------
  // RENDER SUBJECT DETAILS
  // -------------------------
  function renderSubjectDetails(index) {
    const sub = subjects[index];
    if (!sub) return;
    const isInstructor = userRole === 'instructor';

    detailsContainer.innerHTML = `
      <div class="detail-header">
        <h2>${sub.name}</h2>
        <div class="detail-meta">
          <span><i class="fas fa-chalkboard-teacher"></i> ${sub.teacher}</span>
          <span><i class="fas fa-clock"></i> ${sub.time}</span>
        </div>
        <p class="detail-description">${sub.description || "No description available."}</p>
        ${isInstructor ? `
          <div class="detail-actions">
            <button class="btn-edit-subject" data-index="${index}">
              <i class="fas fa-edit"></i> Edit
            </button>
            <button class="btn-sync-cloud">
              <i class="fas fa-cloud-upload-alt"></i> Sync to Cloud
            </button>
          </div>
        ` : ''}
      </div>

      <div class="subject-tabs">
        <button class="tab-btn active" data-tab="tasks"><i class="fas fa-tasks"></i> Tasks</button>
        <button class="tab-btn" data-tab="assignments"><i class="fas fa-clipboard-list"></i> Assignments</button>
        <button class="tab-btn" data-tab="lessons"><i class="fas fa-book-open"></i> Lessons</button>
        <button class="tab-btn" data-tab="quizzes"><i class="fas fa-question-circle"></i> Quizzes</button>
      </div>

      <!-- TASKS TAB -->
      <div class="tab-content active" id="tasks-tab">
        <div class="items-container">
          <div class="items-header">
            <h3><i class="fas fa-tasks"></i> Tasks</h3>
            ${isInstructor ? `<button class="btn-add-item" data-type="task" data-subject-index="${index}"><i class="fas fa-plus"></i> Add Task</button>` : ''}
          </div>
          <div class="items-list">
            ${sub.tasks.length === 0
              ? '<p style="color:var(--text-secondary);padding:20px;text-align:center;">No tasks yet.</p>'
              : sub.tasks.map((task, i) => {
                  const myTaskSubmission = task.submissions?.find(s => s.studentId === userData?.id);
                  return `
                    <div class="item-card">
                      <div class="item-info">
                        <h4>${task.title}</h4>
                        <p><i class="fas fa-calendar"></i> Due: ${task.dueDate} &nbsp;|&nbsp; <i class="fas fa-flag"></i> Priority: ${task.priority} &nbsp;|&nbsp; <i class="fas fa-circle"></i> Status: ${task.status}</p>
                        <p>${task.description || ''}</p>
                        ${task.fileUrl ? `<p><a href="${task.fileUrl}" target="_blank" style="color:var(--accent);"><i class="fas fa-paperclip"></i> ${task.file}</a></p>` : ''}
                        ${!isInstructor ? `
                          ${myTaskSubmission ? `
                            <span class="assignment-submitted-badge ${myTaskSubmission.score !== undefined ? 'scored' : ''}">
                              ${myTaskSubmission.score !== undefined
                                ? `<i class="fas fa-trophy"></i> Score: ${myTaskSubmission.score} pts`
                                : `<i class="fas fa-check"></i> Submitted — Awaiting score`}
                            </span>
                          ` : ''}
                        ` : `
                          <span style="color:var(--text-secondary);font-size:0.88em;">
                            <i class="fas fa-users"></i> ${task.submissions?.length || 0} submission(s)
                          </span>
                        `}
                      </div>
                      <div class="item-actions">
                        ${!isInstructor ? `
                          <button class="btn-submit-task" data-task-index="${i}" data-subject-index="${index}">
                            <i class="fas fa-paper-plane"></i> ${myTaskSubmission ? 'Re-submit' : 'Submit'}
                          </button>
                        ` : `
                          <button class="btn-view-task-submissions" data-task-index="${i}" data-subject-index="${index}">
                            <i class="fas fa-inbox"></i> Submissions (${task.submissions?.length || 0})
                          </button>
                          <button class="btn-edit-item" data-type="task" data-item-index="${i}" data-subject-index="${index}"><i class="fas fa-edit"></i></button>
                          <button class="btn-delete-item" data-type="task" data-item-index="${i}" data-subject-index="${index}"><i class="fas fa-trash"></i></button>
                        `}
                      </div>
                    </div>
                  `;
                }).join('')
            }
          </div>
        </div>
      </div>

      <!-- ASSIGNMENTS TAB -->
      <div class="tab-content" id="assignments-tab">
        <div class="items-container">
          <div class="items-header">
            <h3><i class="fas fa-clipboard-list"></i> Assignments</h3>
            ${isInstructor ? `<button class="btn-add-item" data-type="assignment" data-subject-index="${index}"><i class="fas fa-plus"></i> Add Assignment</button>` : ''}
          </div>
          <div class="items-list">
            ${sub.assignments.length === 0
              ? '<p style="color:var(--text-secondary);padding:20px;text-align:center;">No assignments yet.</p>'
              : sub.assignments.map((assignment, i) => {
                  const mySubmission = assignment.submissions?.find(s => s.studentId === userData?.id);
                  return `
                    <div class="item-card">
                      <div class="item-info">
                        <h4>${assignment.title}</h4>
                        <p><i class="fas fa-calendar"></i> Due: ${assignment.dueDate} &nbsp;|&nbsp; <i class="fas fa-star"></i> Points: ${assignment.points} &nbsp;|&nbsp; <i class="fas fa-circle"></i> Status: ${assignment.status}</p>
                        <p>${assignment.instructions || ''}</p>
                        ${assignment.fileUrl ? `<p><a href="${assignment.fileUrl}" target="_blank" style="color:var(--accent);"><i class="fas fa-paperclip"></i> ${assignment.file}</a></p>` : ''}
                        ${!isInstructor ? `
                          ${mySubmission ? `
                            <span class="assignment-submitted-badge ${mySubmission.score !== undefined ? 'scored' : ''}">
                              ${mySubmission.score !== undefined
                                ? `<i class="fas fa-trophy"></i> Score: ${mySubmission.score} / ${assignment.points}`
                                : `<i class="fas fa-check"></i> Submitted — Awaiting score`}
                            </span>
                          ` : ''}
                        ` : `
                          <span style="color:var(--text-secondary);font-size:0.88em;">
                            <i class="fas fa-users"></i> ${assignment.submissions?.length || 0} submission(s)
                          </span>
                        `}
                      </div>
                      <div class="item-actions">
                        ${!isInstructor ? `
                          <button class="btn-submit-assignment btn-edit-item" data-assignment-index="${i}" data-subject-index="${index}">
                            <i class="fas fa-paper-plane"></i> ${mySubmission ? 'Re-submit' : 'Submit'}
                          </button>
                        ` : `
                          <button class="btn-view-submissions btn-edit-item" data-assignment-index="${i}" data-subject-index="${index}">
                            <i class="fas fa-inbox"></i> Submissions (${assignment.submissions?.length || 0})
                          </button>
                          <button class="btn-edit-item" data-type="assignment" data-item-index="${i}" data-subject-index="${index}"><i class="fas fa-edit"></i></button>
                          <button class="btn-delete-item" data-type="assignment" data-item-index="${i}" data-subject-index="${index}"><i class="fas fa-trash"></i></button>
                        `}
                      </div>
                    </div>
                  `;
                }).join('')
            }
          </div>
        </div>
      </div>

      <!-- LESSONS TAB -->
      <div class="tab-content" id="lessons-tab">
        <div class="items-container">
          <div class="items-header">
            <h3><i class="fas fa-book-open"></i> Lessons</h3>
            ${isInstructor ? `<button class="btn-add-item" data-type="lesson" data-subject-index="${index}"><i class="fas fa-plus"></i> Add Lesson</button>` : ''}
          </div>
          <div class="items-list">
            ${sub.lessons.length === 0
              ? '<p style="color:var(--text-secondary);padding:20px;text-align:center;">No lessons yet.</p>'
              : sub.lessons.map((lesson, i) => `
                <div class="item-card">
                  <div class="item-info">
                    <h4>${lesson.title}</h4>
                    <p><i class="fas fa-hourglass-half"></i> ${lesson.duration} &nbsp;•&nbsp; <i class="fas fa-circle"></i> ${lesson.status}</p>
                    <p>${lesson.content || ''}</p>
                    ${lesson.fileUrl ? `<p><a href="${lesson.fileUrl}" target="_blank" style="color:var(--accent);"><i class="fas fa-paperclip"></i> ${lesson.file}</a></p>` : ''}
                  </div>
                  ${isInstructor ? `
                    <div class="item-actions">
                      <button class="btn-edit-item" data-type="lesson" data-item-index="${i}" data-subject-index="${index}"><i class="fas fa-edit"></i></button>
                      <button class="btn-delete-item" data-type="lesson" data-item-index="${i}" data-subject-index="${index}"><i class="fas fa-trash"></i></button>
                    </div>
                  ` : ''}
                </div>
              `).join('')
            }
          </div>
        </div>
      </div>

      <!-- QUIZZES TAB -->
      <div class="tab-content" id="quizzes-tab">
        <div class="items-container">
          <div class="items-header">
            <h3><i class="fas fa-question-circle"></i> Quizzes</h3>
            ${isInstructor ? `<button class="btn-add-item" data-type="quiz" data-subject-index="${index}"><i class="fas fa-plus"></i> Add Quiz</button>` : ''}
          </div>
          <div class="items-list">
            ${sub.quizzes.length === 0
              ? '<p style="color:var(--text-secondary);padding:20px;text-align:center;">No quizzes yet.</p>'
              : sub.quizzes.map((quiz, i) => `
                <div class="item-card">
                  <div class="item-info">
                    <h4>${quiz.title}</h4>
                    <p><i class="fas fa-calendar"></i> Due: ${quiz.dueDate} &nbsp;|&nbsp; <i class="fas fa-star"></i> Points: ${quiz.points} &nbsp;|&nbsp; Status: ${quiz.status}</p>
                    <p>${quiz.instructions || ''}</p>
                  </div>
                  ${isInstructor ? `
                    <div class="item-actions">
                      <button class="btn-edit-item" data-type="quiz" data-item-index="${i}" data-subject-index="${index}"><i class="fas fa-edit"></i></button>
                      <button class="btn-delete-item" data-type="quiz" data-item-index="${i}" data-subject-index="${index}"><i class="fas fa-trash"></i></button>
                    </div>
                  ` : ''}
                </div>
              `).join('')
            }
          </div>
        </div>
      </div>
    `;

    // Edit subject button
    document.querySelector('.btn-edit-subject')?.addEventListener('click', e => {
      openEditModal(e.currentTarget.dataset.index);
    });

    // Sync button
    document.querySelector('.btn-sync-cloud')?.addEventListener('click', async () => {
      await saveAndNotify('Synced to cloud!');
    });

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab + '-tab').classList.add('active');
      });
    });

    // Add item buttons
    document.querySelectorAll('.btn-add-item').forEach(btn => {
      btn.addEventListener('click', () => openAddItemModal(parseInt(btn.dataset.subjectIndex), btn.dataset.type));
    });

    // Edit item buttons
    document.querySelectorAll('.btn-edit-item[data-type]').forEach(btn => {
      btn.addEventListener('click', () => openEditItemModal(parseInt(btn.dataset.subjectIndex), btn.dataset.type, parseInt(btn.dataset.itemIndex)));
    });

    // Delete item buttons
    document.querySelectorAll('.btn-delete-item').forEach(btn => {
      btn.addEventListener('click', () => deleteItem(parseInt(btn.dataset.subjectIndex), btn.dataset.type, parseInt(btn.dataset.itemIndex)));
    });

    // Submit task (student)
    document.querySelectorAll('.btn-submit-task').forEach(btn => {
      btn.addEventListener('click', () => openSubmitTaskModal(parseInt(btn.dataset.subjectIndex), parseInt(btn.dataset.taskIndex)));
    });

    // View task submissions (instructor)
    document.querySelectorAll('.btn-view-task-submissions').forEach(btn => {
      btn.addEventListener('click', () => viewTaskSubmissions(parseInt(btn.dataset.subjectIndex), parseInt(btn.dataset.taskIndex)));
    });

    // Submit assignment (student)
    document.querySelectorAll('.btn-submit-assignment').forEach(btn => {
      btn.addEventListener('click', () => openSubmitAssignmentModal(parseInt(btn.dataset.subjectIndex), parseInt(btn.dataset.assignmentIndex)));
    });

    // View submissions (instructor)
    document.querySelectorAll('.btn-view-submissions').forEach(btn => {
      btn.addEventListener('click', () => viewSubmissions(parseInt(btn.dataset.subjectIndex), parseInt(btn.dataset.assignmentIndex)));
    });
  }

  // -------------------------
  // MODAL HELPERS
  // -------------------------
  addBtn?.addEventListener('click', () => { addModal.style.display = 'block'; });

  function openEditModal(index) {
    const sub = subjects[index];
    if (!sub) return;
    document.getElementById('editSubjectIndex').value = index;
    document.getElementById('editSubjectName').value = sub.name;
    document.getElementById('editTeacherName').value = sub.teacher;
    document.getElementById('editSubjectTime').value = sub.time;
    document.getElementById('editSubjectDescription').value = sub.description || '';
    editModal.style.display = 'block';
  }

  function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    // Remove any dynamically created modals
    document.querySelectorAll('#addQuizModal, #editQuizModal, #submitAssignmentModal, #viewSubmissionsModal, #submitTaskModal, #viewTaskSubmissionsModal').forEach(m => m.remove());
  }

  document.querySelectorAll('.modal .close').forEach(btn => btn.addEventListener('click', closeAllModals));
  window.addEventListener('click', e => { if (e.target.classList.contains('modal')) closeAllModals(); });

  // -------------------------
  // ADD SUBJECT
  // -------------------------
  addForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const subject = {
      id: Date.now().toString(),
      name: document.getElementById('newSubjectName').value.trim(),
      teacher: document.getElementById('newTeacherName').value.trim(),
      time: document.getElementById('newSubjectTime').value.trim(),
      description: document.getElementById('newSubjectDescription').value.trim(),
      lessons: [], tasks: [], assignments: [], quizzes: []
    };
    subjects.push(subject);
    renderSubjects();
    addForm.reset();
    addModal.style.display = 'none';
    await saveAndNotify('Subject added and saved to cloud!');
  });

  // -------------------------
  // EDIT SUBJECT
  // -------------------------
  editForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const index = parseInt(document.getElementById('editSubjectIndex').value);
    const existing = subjects[index];
    subjects[index] = {
      ...existing,
      name: document.getElementById('editSubjectName').value.trim(),
      teacher: document.getElementById('editTeacherName').value.trim(),
      time: document.getElementById('editSubjectTime').value.trim(),
      description: document.getElementById('editSubjectDescription').value.trim()
    };
    renderSubjects();
    renderSubjectDetails(index);
    closeAllModals();
    await saveAndNotify('Subject updated and saved to cloud!');
  });

  // -------------------------
  // DELETE SUBJECT
  // -------------------------
  deleteBtn?.addEventListener('click', async () => {
    const index = parseInt(document.getElementById('editSubjectIndex').value);
    if (confirm('Are you sure you want to delete this subject?')) {
      subjects.splice(index, 1);
      renderSubjects();
      detailsContainer.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-book-open"></i>
          <p>Select a subject from the list to view details, tasks, assignments, and lessons.</p>
        </div>
      `;
      closeAllModals();
      await saveAndNotify('Subject deleted and synced to cloud.');
    }
  });

  // -------------------------
  // ADD TASK
  // -------------------------
  document.getElementById('addTaskForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const subjectIndex = parseInt(document.getElementById('taskSubjectIndex').value);
    const sub = subjects[subjectIndex];
    if (!sub) return;
    const task = {
      id: Date.now().toString(),
      title: document.getElementById('newTaskTitle').value.trim(),
      dueDate: document.getElementById('newTaskDueDate').value,
      priority: document.getElementById('newTaskPriority').value,
      status: 'pending',
      description: document.getElementById('newTaskDescription').value.trim(),
      file: null, fileUrl: null,
      submissions: []
    };
    const fileInput = document.getElementById('newTaskFile');
    if (fileInput?.files[0]) {
      task.fileUrl = await uploadFileToSupabase(fileInput.files[0], `subjects/${sub.id}/${task.id}/`);
      task.file = fileInput.files[0].name;
    }
    sub.tasks.push(task);
    renderSubjectDetails(subjectIndex);
    document.getElementById('addTaskForm').reset();
    document.getElementById('addTaskModal').style.display = 'none';
    await saveAndNotify('Task added and saved to cloud!');
  });

  // -------------------------
  // EDIT TASK
  // -------------------------
  document.getElementById('editTaskForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const itemIndex = parseInt(document.getElementById('editTaskIndex').value);
    const subjectIndex = parseInt(document.getElementById('editTaskSubjectIndex').value);
    const sub = subjects[subjectIndex];
    if (!sub?.tasks[itemIndex]) return;
    const fileInput = document.getElementById('editTaskFile');
    let { file: fileName, fileUrl } = sub.tasks[itemIndex];
    if (fileInput?.files[0]) {
      fileUrl = await uploadFileToSupabase(fileInput.files[0], `subjects/${sub.id}/${sub.tasks[itemIndex].id}/`);
      fileName = fileInput.files[0].name;
    }
    sub.tasks[itemIndex] = {
      ...sub.tasks[itemIndex],
      title: document.getElementById('editTaskTitle').value.trim(),
      dueDate: document.getElementById('editTaskDueDate').value,
      priority: document.getElementById('editTaskPriority').value,
      status: document.getElementById('editTaskStatus').value,
      description: document.getElementById('editTaskDescription').value.trim(),
      file: fileName, fileUrl
    };
    renderSubjectDetails(subjectIndex);
    closeAllModals();
    await saveAndNotify('Task updated and saved to cloud!');
  });

  document.getElementById('deleteTaskBtn')?.addEventListener('click', () => {
    deleteItem(
      parseInt(document.getElementById('editTaskSubjectIndex').value),
      'task',
      parseInt(document.getElementById('editTaskIndex').value)
    );
  });

  // -------------------------
  // ADD ASSIGNMENT
  // -------------------------
  document.getElementById('addAssignmentForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const subjectIndex = parseInt(document.getElementById('assignmentSubjectIndex').value);
    const sub = subjects[subjectIndex];
    if (!sub) return;
    const assignment = {
      id: Date.now().toString(),
      title: document.getElementById('newAssignmentTitle').value.trim(),
      dueDate: document.getElementById('newAssignmentDueDate').value,
      points: parseInt(document.getElementById('newAssignmentPoints').value),
      status: document.getElementById('newAssignmentStatus').value,
      instructions: document.getElementById('newAssignmentInstructions').value.trim(),
      file: null, fileUrl: null, submissions: []
    };
    const fileInput = document.getElementById('newAssignmentFile');
    if (fileInput?.files[0]) {
      assignment.fileUrl = await uploadFileToSupabase(fileInput.files[0], `subjects/${sub.id}/${assignment.id}/`);
      assignment.file = fileInput.files[0].name;
    }
    sub.assignments.push(assignment);
    renderSubjectDetails(subjectIndex);
    document.getElementById('addAssignmentForm').reset();
    document.getElementById('addAssignmentModal').style.display = 'none';
    await saveAndNotify('Assignment added and saved to cloud!');
  });

  // -------------------------
  // EDIT ASSIGNMENT
  // -------------------------
  document.getElementById('editAssignmentForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const itemIndex = parseInt(document.getElementById('editAssignmentIndex').value);
    const subjectIndex = parseInt(document.getElementById('editAssignmentSubjectIndex').value);
    const sub = subjects[subjectIndex];
    if (!sub?.assignments[itemIndex]) return;
    const fileInput = document.getElementById('editAssignmentFile');
    let { file: fileName, fileUrl } = sub.assignments[itemIndex];
    if (fileInput?.files[0]) {
      fileUrl = await uploadFileToSupabase(fileInput.files[0], `subjects/${sub.id}/${sub.assignments[itemIndex].id}/`);
      fileName = fileInput.files[0].name;
    }
    sub.assignments[itemIndex] = {
      ...sub.assignments[itemIndex],
      title: document.getElementById('editAssignmentTitle').value.trim(),
      dueDate: document.getElementById('editAssignmentDueDate').value,
      points: parseInt(document.getElementById('editAssignmentPoints').value),
      status: document.getElementById('editAssignmentStatus').value,
      instructions: document.getElementById('editAssignmentInstructions').value.trim(),
      file: fileName, fileUrl
    };
    renderSubjectDetails(subjectIndex);
    closeAllModals();
    await saveAndNotify('Assignment updated and saved to cloud!');
  });

  document.getElementById('deleteAssignmentBtn')?.addEventListener('click', () => {
    deleteItem(
      parseInt(document.getElementById('editAssignmentSubjectIndex').value),
      'assignment',
      parseInt(document.getElementById('editAssignmentIndex').value)
    );
  });

  // -------------------------
  // ADD LESSON
  // -------------------------
  document.getElementById('addLessonForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const subjectIndex = parseInt(document.getElementById('lessonSubjectIndex').value);
    const sub = subjects[subjectIndex];
    if (!sub) return;
    const lesson = {
      id: Date.now().toString(),
      title: document.getElementById('newLessonTitle').value.trim(),
      duration: document.getElementById('newLessonDuration').value.trim(),
      status: document.getElementById('newLessonStatus').value,
      content: document.getElementById('newLessonContent').value.trim(),
      file: null, fileUrl: null
    };
    const fileInput = document.getElementById('newLessonFile');
    if (fileInput?.files[0]) {
      lesson.fileUrl = await uploadFileToSupabase(fileInput.files[0], `subjects/${sub.id}/${lesson.id}/`);
      lesson.file = fileInput.files[0].name;
    }
    sub.lessons.push(lesson);
    renderSubjectDetails(subjectIndex);
    document.getElementById('addLessonForm').reset();
    document.getElementById('addLessonModal').style.display = 'none';
    await saveAndNotify('Lesson added and saved to cloud!');
  });

  // -------------------------
  // EDIT LESSON
  // -------------------------
  document.getElementById('editLessonForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const itemIndex = parseInt(document.getElementById('editLessonIndex').value);
    const subjectIndex = parseInt(document.getElementById('editLessonSubjectIndex').value);
    const sub = subjects[subjectIndex];
    if (!sub?.lessons[itemIndex]) return;
    const fileInput = document.getElementById('editLessonFile');
    let { file: fileName, fileUrl } = sub.lessons[itemIndex];
    if (fileInput?.files[0]) {
      fileUrl = await uploadFileToSupabase(fileInput.files[0], `subjects/${sub.id}/${sub.lessons[itemIndex].id}/`);
      fileName = fileInput.files[0].name;
    }
    sub.lessons[itemIndex] = {
      ...sub.lessons[itemIndex],
      title: document.getElementById('editLessonTitle').value.trim(),
      duration: document.getElementById('editLessonDuration').value.trim(),
      status: document.getElementById('editLessonStatus').value,
      content: document.getElementById('editLessonContent').value.trim(),
      file: fileName, fileUrl
    };
    renderSubjectDetails(subjectIndex);
    closeAllModals();
    await saveAndNotify('Lesson updated and saved to cloud!');
  });

  document.getElementById('deleteLessonBtn')?.addEventListener('click', () => {
    deleteItem(
      parseInt(document.getElementById('editLessonSubjectIndex').value),
      'lesson',
      parseInt(document.getElementById('editLessonIndex').value)
    );
  });

  // -------------------------
  // OPEN ADD ITEM MODAL
  // -------------------------
  function openAddItemModal(subjectIndex, type) {
    if (type === 'quiz') {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.id = 'addQuizModal';
      modal.innerHTML = `
        <div class="modal-content">
          <span class="close">&times;</span>
          <div class="modal-body">
            <h2><i class="fas fa-question-circle"></i> Add New Quiz</h2>
            <form id="addQuizForm">
              <div class="form-group">
                <label>Quiz Title</label>
                <input type="text" id="newQuizTitle" required placeholder="e.g. Chapter 1 Quiz" />
              </div>
              <div class="form-group">
                <label>Due Date</label>
                <input type="date" id="newQuizDueDate" required />
              </div>
              <div class="form-group">
                <label>Points</label>
                <input type="number" id="newQuizPoints" required placeholder="e.g. 50" />
              </div>
              <div class="form-group">
                <label>Instructions</label>
                <textarea id="newQuizInstructions" rows="3" placeholder="Quiz instructions..."></textarea>
              </div>
              <button type="submit" class="btn-add-subject"><i class="fas fa-plus"></i> Add Quiz</button>
            </form>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.style.display = 'block';
      modal.querySelector('.close').addEventListener('click', () => modal.remove());
      modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
      modal.querySelector('#addQuizForm').addEventListener('submit', async e => {
        e.preventDefault();
        subjects[subjectIndex].quizzes.push({
          title: document.getElementById('newQuizTitle').value.trim(),
          dueDate: document.getElementById('newQuizDueDate').value,
          points: parseInt(document.getElementById('newQuizPoints').value),
          status: 'available',
          instructions: document.getElementById('newQuizInstructions').value.trim()
        });
        renderSubjectDetails(subjectIndex);
        modal.remove();
        await saveAndNotify('Quiz added and saved to cloud!');
      });
    } else {
      const modalId = `add${type.charAt(0).toUpperCase() + type.slice(1)}Modal`;
      const modal = document.getElementById(modalId);
      if (!modal) return;
      document.getElementById(`${type}SubjectIndex`).value = subjectIndex;
      modal.style.display = 'block';
    }
  }

  // -------------------------
  // OPEN EDIT ITEM MODAL
  // -------------------------
  function openEditItemModal(subjectIndex, type, itemIndex) {
    const sub = subjects[subjectIndex];
    if (!sub) return;
    const item = sub[`${type}s`][itemIndex];
    if (!item) return;

    if (type === 'quiz') {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.id = 'editQuizModal';
      modal.innerHTML = `
        <div class="modal-content">
          <span class="close">&times;</span>
          <div class="modal-body">
            <h2><i class="fas fa-edit"></i> Edit Quiz</h2>
            <form id="editQuizForm">
              <div class="form-group">
                <label>Quiz Title</label>
                <input type="text" id="editQuizTitle" value="${item.title}" required />
              </div>
              <div class="form-group">
                <label>Due Date</label>
                <input type="date" id="editQuizDueDate" value="${item.dueDate}" required />
              </div>
              <div class="form-group">
                <label>Points</label>
                <input type="number" id="editQuizPoints" value="${item.points}" required />
              </div>
              <div class="form-group">
                <label>Instructions</label>
                <textarea id="editQuizInstructions" rows="3">${item.instructions || ''}</textarea>
              </div>
              <div class="form-actions">
                <button type="submit" class="btn-save"><i class="fas fa-check"></i> Save Changes</button>
                <button type="button" class="btn-delete" id="deleteQuizBtn"><i class="fas fa-trash"></i> Delete</button>
              </div>
            </form>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.style.display = 'block';
      modal.querySelector('.close').addEventListener('click', () => modal.remove());
      modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
      modal.querySelector('#editQuizForm').addEventListener('submit', async e => {
        e.preventDefault();
        sub.quizzes[itemIndex] = {
          ...sub.quizzes[itemIndex],
          title: document.getElementById('editQuizTitle').value.trim(),
          dueDate: document.getElementById('editQuizDueDate').value,
          points: parseInt(document.getElementById('editQuizPoints').value),
          instructions: document.getElementById('editQuizInstructions').value.trim()
        };
        renderSubjectDetails(subjectIndex);
        modal.remove();
        await saveAndNotify('Quiz updated and saved to cloud!');
      });
      modal.querySelector('#deleteQuizBtn').addEventListener('click', async () => {
        if (confirm('Delete this quiz?')) {
          sub.quizzes.splice(itemIndex, 1);
          renderSubjectDetails(subjectIndex);
          modal.remove();
          await saveAndNotify('Quiz deleted and synced to cloud.');
        }
      });
      return;
    }

    const modalId = `edit${type.charAt(0).toUpperCase() + type.slice(1)}Modal`;
    const modal = document.getElementById(modalId);
    if (!modal) return;
    document.getElementById(`edit${type.charAt(0).toUpperCase() + type.slice(1)}Index`).value = itemIndex;
    document.getElementById(`edit${type.charAt(0).toUpperCase() + type.slice(1)}SubjectIndex`).value = subjectIndex;

    if (type === 'task') {
      document.getElementById('editTaskTitle').value = item.title;
      document.getElementById('editTaskDueDate').value = item.dueDate;
      document.getElementById('editTaskPriority').value = item.priority;
      document.getElementById('editTaskStatus').value = item.status;
      document.getElementById('editTaskDescription').value = item.description || '';
    } else if (type === 'assignment') {
      document.getElementById('editAssignmentTitle').value = item.title;
      document.getElementById('editAssignmentDueDate').value = item.dueDate;
      document.getElementById('editAssignmentPoints').value = item.points;
      document.getElementById('editAssignmentStatus').value = item.status;
      document.getElementById('editAssignmentInstructions').value = item.instructions || '';
    } else if (type === 'lesson') {
      document.getElementById('editLessonTitle').value = item.title;
      document.getElementById('editLessonDuration').value = item.duration;
      document.getElementById('editLessonStatus').value = item.status;
      document.getElementById('editLessonContent').value = item.content || '';
    }
    modal.style.display = 'block';
  }

  // -------------------------
  // SUBMIT ASSIGNMENT (STUDENT) — per-student scoring
  // -------------------------
  function openSubmitAssignmentModal(subjectIndex, assignmentIndex) {
    const sub = subjects[subjectIndex];
    if (!sub) return;
    const assignment = sub.assignments[assignmentIndex];
    if (!assignment) return;

    const existingSubmission = assignment.submissions?.find(s => s.studentId === userData?.id);

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'submitAssignmentModal';
    modal.innerHTML = `
      <div class="modal-content submission-modal-content">
        <span class="close">&times;</span>
        <div class="modal-body">
          <div class="submission-modal-header">
            <div class="submission-icon"><i class="fas fa-paper-plane"></i></div>
            <h2>Submit Assignment</h2>
            <p class="submission-assignment-title">${assignment.title}</p>
            <div class="submission-meta-row">
              <span class="submission-meta-badge"><i class="fas fa-star"></i> ${assignment.points} pts</span>
              <span class="submission-meta-badge due"><i class="fas fa-calendar"></i> Due: ${assignment.dueDate}</span>
            </div>
          </div>

          ${existingSubmission ? `
            <div class="already-submitted-banner">
              <i class="fas fa-check-circle"></i>
              <div>
                <strong>Already Submitted</strong>
                <span>You can re-submit to replace your current file.</span>
              </div>
            </div>
            <div class="existing-submission-info">
              <i class="fas fa-file"></i>
              <span>${existingSubmission.fileName}</span>
              <a href="${existingSubmission.fileUrl}" target="_blank" class="btn-view-file">
                <i class="fas fa-eye"></i> View
              </a>
              ${existingSubmission.score !== undefined
                ? `<div class="student-score-display"><i class="fas fa-trophy"></i> Score: <strong>${existingSubmission.score} / ${assignment.points}</strong></div>`
                : `<div class="student-score-display pending-score"><i class="fas fa-clock"></i> Awaiting score</div>`
              }
            </div>
          ` : ''}

          <form id="submitAssignmentForm">
            <div class="form-group upload-zone" id="uploadZone">
              <input type="file" id="submitFile" style="display:none" required />
              <label for="submitFile" class="upload-label">
                <i class="fas fa-cloud-upload-alt"></i>
                <span id="uploadText">Click or drag to upload your file</span>
                <small>Any file type accepted</small>
              </label>
            </div>
            <div class="submission-note-group">
              <label><i class="fas fa-sticky-note"></i> Note (Optional)</label>
              <textarea id="submitNote" rows="3" placeholder="Add a note to your instructor..."></textarea>
            </div>
            <button type="submit" class="btn-submit-final">
              <i class="fas fa-paper-plane"></i>
              ${existingSubmission ? 'Re-submit Assignment' : 'Submit Assignment'}
            </button>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'block';

    // Drag & drop + file select feedback
    const uploadZone = modal.querySelector('#uploadZone');
    const fileInput = modal.querySelector('#submitFile');
    const uploadText = modal.querySelector('#uploadText');
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) {
        uploadText.textContent = fileInput.files[0].name;
        uploadZone.classList.add('file-selected');
      }
    });
    uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragging'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragging'));
    uploadZone.addEventListener('drop', e => {
      e.preventDefault();
      uploadZone.classList.remove('dragging');
      if (e.dataTransfer.files[0]) {
        fileInput.files = e.dataTransfer.files;
        uploadText.textContent = e.dataTransfer.files[0].name;
        uploadZone.classList.add('file-selected');
      }
    });

    modal.querySelector('.close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    modal.querySelector('#submitAssignmentForm').addEventListener('submit', async e => {
      e.preventDefault();
      if (!fileInput.files[0]) { showToast('Please select a file.', 'error'); return; }

      const submitBtn = modal.querySelector('.btn-submit-final');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

      const file = fileInput.files[0];
      const note = document.getElementById('submitNote').value.trim();
      const fileUrl = await uploadFileToSupabase(file, `subjects/${sub.id}/${assignment.id}/submissions/${userData?.id}/`);

      if (!fileUrl) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Assignment';
        return;
      }

      if (!assignment.submissions) assignment.submissions = [];
      // Remove prior submission from this student only
      assignment.submissions = assignment.submissions.filter(s => s.studentId !== userData?.id);
      assignment.submissions.push({
        studentId: userData?.id,
        studentName: userData?.name || userData?.id,
        fileName: file.name,
        fileUrl,
        note,
        submittedAt: new Date().toISOString(),
        score: undefined  // scored individually by instructor
      });

      saveSubjects(false); // update localStorage immediately so UI reflects submission
      renderSubjectDetails(subjectIndex);
      modal.remove();
      await saveAndNotify('Assignment submitted and saved to cloud!');
    });
  }

  // -------------------------
  // VIEW SUBMISSIONS + PER-STUDENT SCORING (INSTRUCTOR)
  // -------------------------
  function viewSubmissions(subjectIndex, assignmentIndex) {
    const sub = subjects[subjectIndex];
    if (!sub) return;
    const assignment = sub.assignments[assignmentIndex];
    if (!assignment) return;

    const submissions = assignment.submissions || [];

    function buildSubmissionCard(submission, i) {
      const hasScore = submission.score !== undefined;
      return `
        <div class="submission-card ${hasScore ? 'has-score' : 'no-score'}" data-index="${i}">
          <div class="submission-card-header">
            <div class="student-avatar"><i class="fas fa-user-graduate"></i></div>
            <div class="student-submission-info">
              <h4>${submission.studentName || submission.studentId}</h4>
              <span class="submission-time"><i class="fas fa-clock"></i> ${new Date(submission.submittedAt).toLocaleString()}</span>
            </div>
            <div class="score-display ${hasScore ? 'scored' : 'unscored'}">
              ${hasScore
                ? `<i class="fas fa-check-circle"></i> <strong>${submission.score}</strong> / ${assignment.points} pts`
                : `<i class="fas fa-hourglass-half"></i> Not scored`}
            </div>
          </div>
          ${submission.note ? `
            <div class="submission-note">
              <i class="fas fa-comment-alt"></i>
              <span>${submission.note}</span>
            </div>
          ` : ''}
          <div class="submission-file-row">
            <div class="submission-file-info">
              <i class="fas fa-file-alt"></i>
              <span>${submission.fileName}</span>
            </div>
            <a href="${submission.fileUrl}" target="_blank" class="btn-download-submission">
              <i class="fas fa-download"></i> Download
            </a>
          </div>
          <div class="score-input-row">
            <label class="score-label"><i class="fas fa-star"></i> Score</label>
            <div class="score-input-group">
              <input
                type="number"
                id="scoreInput_${i}"
                class="score-number-input"
                value="${hasScore ? submission.score : ''}"
                min="0"
                max="${assignment.points}"
                step="0.5"
                placeholder="0 – ${assignment.points}"
              />
              <span class="score-max">/ ${assignment.points}</span>
              <button class="btn-save-score" data-submission-index="${i}">
                <i class="fas fa-save"></i> Save Score
              </button>
            </div>
          </div>
        </div>
      `;
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'viewSubmissionsModal';
    modal.innerHTML = `
      <div class="modal-content submissions-viewer-content">
        <span class="close">&times;</span>
        <div class="modal-body">
          <div class="submissions-viewer-header">
            <div class="submissions-icon"><i class="fas fa-inbox"></i></div>
            <h2>Submissions</h2>
            <p class="submissions-assignment-title">${assignment.title}</p>
            <div class="submissions-stats-row">
              <div class="submissions-stat">
                <span class="stat-num">${submissions.length}</span>
                <span class="stat-lbl">Submitted</span>
              </div>
              <div class="submissions-stat">
                <span class="stat-num scored-count">${submissions.filter(s => s.score !== undefined).length}</span>
                <span class="stat-lbl">Scored</span>
              </div>
              <div class="submissions-stat">
                <span class="stat-num">${assignment.points}</span>
                <span class="stat-lbl">Max Points</span>
              </div>
            </div>
          </div>
          <div class="submissions-list">
            ${submissions.length === 0
              ? `<div class="no-submissions"><i class="fas fa-inbox"></i><p>No submissions yet.</p></div>`
              : submissions.map((s, i) => buildSubmissionCard(s, i)).join('')
            }
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'block';
    modal.querySelector('.close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    // Per-student score saving — awaits Firestore write before showing toast
    modal.querySelectorAll('.btn-save-score').forEach(btn => {
      btn.addEventListener('click', async () => {
        const submissionIndex = parseInt(btn.dataset.submissionIndex);
        const scoreInput = modal.querySelector(`#scoreInput_${submissionIndex}`);
        const scoreVal = parseFloat(scoreInput.value);

        if (isNaN(scoreVal) || scoreVal < 0 || scoreVal > assignment.points) {
          showToast(`Score must be between 0 and ${assignment.points}`, 'error');
          scoreInput.classList.add('input-error');
          setTimeout(() => scoreInput.classList.remove('input-error'), 1500);
          return;
        }

        // Disable button while saving
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        // Save score only to this specific student's submission
        assignment.submissions[submissionIndex].score = scoreVal;

        // Await full Firestore write before confirming
        await saveAndNotify(`Score saved for ${assignment.submissions[submissionIndex].studentName || 'student'}!`);

        // Update the score badge in the modal without full re-render
        const card = modal.querySelector(`.submission-card[data-index="${submissionIndex}"]`);
        const scoreDisplayEl = card.querySelector('.score-display');
        scoreDisplayEl.innerHTML = `<i class="fas fa-check-circle"></i> <strong>${scoreVal}</strong> / ${assignment.points} pts`;
        scoreDisplayEl.className = 'score-display scored';
        card.className = 'submission-card has-score';

        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Saved!';
        btn.classList.add('saved');
        setTimeout(() => { btn.innerHTML = '<i class="fas fa-save"></i> Save Score'; btn.classList.remove('saved'); }, 2000);

        // Update scored count in header
        const scoredCount = assignment.submissions.filter(s => s.score !== undefined).length;
        const scoredCountEl = modal.querySelector('.scored-count');
        if (scoredCountEl) scoredCountEl.textContent = scoredCount;

        renderSubjectDetails(subjectIndex);
      });
    });
  }

  // -------------------------
  // SUBMIT TASK (STUDENT) — per-student scoring
  // -------------------------
  function openSubmitTaskModal(subjectIndex, taskIndex) {
    const sub = subjects[subjectIndex];
    if (!sub) return;
    const task = sub.tasks[taskIndex];
    if (!task) return;

    if (!task.submissions) task.submissions = [];
    const existingSubmission = task.submissions.find(s => s.studentId === userData?.id);

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'submitTaskModal';
    modal.innerHTML = `
      <div class="modal-content submission-modal-content">
        <span class="close">&times;</span>
        <div class="modal-body">
          <div class="submission-modal-header">
            <div class="submission-icon"><i class="fas fa-tasks"></i></div>
            <h2>Submit Task</h2>
            <p class="submission-assignment-title">${task.title}</p>
            <div class="submission-meta-row">
              <span class="submission-meta-badge"><i class="fas fa-flag"></i> ${task.priority} priority</span>
              <span class="submission-meta-badge due"><i class="fas fa-calendar"></i> Due: ${task.dueDate}</span>
            </div>
          </div>

          ${existingSubmission ? `
            <div class="already-submitted-banner">
              <i class="fas fa-check-circle"></i>
              <div>
                <strong>Already Submitted</strong>
                <span>You can re-submit to replace your current file.</span>
              </div>
            </div>
            <div class="existing-submission-info">
              <i class="fas fa-file"></i>
              <span>${existingSubmission.fileName}</span>
              <a href="${existingSubmission.fileUrl}" target="_blank" class="btn-view-file">
                <i class="fas fa-eye"></i> View
              </a>
              ${existingSubmission.score !== undefined
                ? `<div class="student-score-display"><i class="fas fa-trophy"></i> Score: <strong>${existingSubmission.score} pts</strong></div>`
                : `<div class="student-score-display pending-score"><i class="fas fa-clock"></i> Awaiting score</div>`
              }
            </div>
          ` : ''}

          <form id="submitTaskForm">
            <div class="form-group upload-zone" id="uploadZoneTask">
              <input type="file" id="submitTaskFile" style="display:none" required />
              <label for="submitTaskFile" class="upload-label">
                <i class="fas fa-cloud-upload-alt"></i>
                <span id="uploadTextTask">Click or drag to upload your file</span>
                <small>Any file type accepted</small>
              </label>
            </div>
            <div class="submission-note-group">
              <label><i class="fas fa-sticky-note"></i> Note (Optional)</label>
              <textarea id="submitTaskNote" rows="3" placeholder="Add a note to your instructor..."></textarea>
            </div>
            <button type="submit" class="btn-submit-final">
              <i class="fas fa-paper-plane"></i>
              ${existingSubmission ? 'Re-submit Task' : 'Submit Task'}
            </button>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'block';

    // Drag & drop + file select feedback
    const uploadZone = modal.querySelector('#uploadZoneTask');
    const fileInput = modal.querySelector('#submitTaskFile');
    const uploadText = modal.querySelector('#uploadTextTask');
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) {
        uploadText.textContent = fileInput.files[0].name;
        uploadZone.classList.add('file-selected');
      }
    });
    uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragging'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragging'));
    uploadZone.addEventListener('drop', e => {
      e.preventDefault();
      uploadZone.classList.remove('dragging');
      if (e.dataTransfer.files[0]) {
        fileInput.files = e.dataTransfer.files;
        uploadText.textContent = e.dataTransfer.files[0].name;
        uploadZone.classList.add('file-selected');
      }
    });

    modal.querySelector('.close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    modal.querySelector('#submitTaskForm').addEventListener('submit', async e => {
      e.preventDefault();
      if (!fileInput.files[0]) { showToast('Please select a file.', 'error'); return; }

      const submitBtn = modal.querySelector('.btn-submit-final');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

      const file = fileInput.files[0];
      const note = document.getElementById('submitTaskNote').value.trim();
      const fileUrl = await uploadFileToSupabase(file, `subjects/${sub.id}/${task.id}/submissions/${userData?.id}/`);

      if (!fileUrl) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Task';
        return;
      }

      // Remove prior submission from this student only, keep others
      task.submissions = task.submissions.filter(s => s.studentId !== userData?.id);
      task.submissions.push({
        studentId: userData?.id,
        studentName: userData?.name || userData?.id,
        fileName: file.name,
        fileUrl,
        note,
        submittedAt: new Date().toISOString(),
        score: undefined  // scored individually by instructor
      });

      saveSubjects(false);
      renderSubjectDetails(subjectIndex);
      modal.remove();
      await saveAndNotify('Task submitted and saved to cloud!');
    });
  }

  // -------------------------
  // VIEW TASK SUBMISSIONS + PER-STUDENT SCORING (INSTRUCTOR)
  // -------------------------
  function viewTaskSubmissions(subjectIndex, taskIndex) {
    const sub = subjects[subjectIndex];
    if (!sub) return;
    const task = sub.tasks[taskIndex];
    if (!task) return;

    const submissions = task.submissions || [];

    function buildTaskSubmissionCard(submission, i) {
      const hasScore = submission.score !== undefined;
      return `
        <div class="submission-card ${hasScore ? 'has-score' : 'no-score'}" data-index="${i}">
          <div class="submission-card-header">
            <div class="student-avatar"><i class="fas fa-user-graduate"></i></div>
            <div class="student-submission-info">
              <h4>${submission.studentName || submission.studentId}</h4>
              <span class="submission-time"><i class="fas fa-clock"></i> ${new Date(submission.submittedAt).toLocaleString()}</span>
            </div>
            <div class="score-display ${hasScore ? 'scored' : 'unscored'}">
              ${hasScore
                ? `<i class="fas fa-check-circle"></i> <strong>${submission.score}</strong> pts`
                : `<i class="fas fa-hourglass-half"></i> Not scored`}
            </div>
          </div>
          ${submission.note ? `
            <div class="submission-note">
              <i class="fas fa-comment-alt"></i>
              <span>${submission.note}</span>
            </div>
          ` : ''}
          <div class="submission-file-row">
            <div class="submission-file-info">
              <i class="fas fa-file-alt"></i>
              <span>${submission.fileName}</span>
            </div>
            <a href="${submission.fileUrl}" target="_blank" class="btn-download-submission">
              <i class="fas fa-download"></i> Download
            </a>
          </div>
          <div class="score-input-row">
            <label class="score-label"><i class="fas fa-star"></i> Score</label>
            <div class="score-input-group">
              <input
                type="number"
                id="taskScoreInput_${i}"
                class="score-number-input"
                value="${hasScore ? submission.score : ''}"
                min="0"
                step="0.5"
                placeholder="Points"
              />
              <span class="score-max">pts</span>
              <button class="btn-save-score" data-submission-index="${i}">
                <i class="fas fa-save"></i> Save Score
              </button>
            </div>
          </div>
        </div>
      `;
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'viewTaskSubmissionsModal';
    modal.innerHTML = `
      <div class="modal-content submissions-viewer-content">
        <span class="close">&times;</span>
        <div class="modal-body">
          <div class="submissions-viewer-header">
            <div class="submissions-icon"><i class="fas fa-tasks"></i></div>
            <h2>Task Submissions</h2>
            <p class="submissions-assignment-title">${task.title}</p>
            <div class="submissions-stats-row">
              <div class="submissions-stat">
                <span class="stat-num">${submissions.length}</span>
                <span class="stat-lbl">Submitted</span>
              </div>
              <div class="submissions-stat">
                <span class="stat-num task-scored-count">${submissions.filter(s => s.score !== undefined).length}</span>
                <span class="stat-lbl">Scored</span>
              </div>
              <div class="submissions-stat">
                <span class="stat-num"><i class="fas fa-flag" style="font-size:0.8em"></i></span>
                <span class="stat-lbl">${task.priority}</span>
              </div>
            </div>
          </div>
          <div class="submissions-list">
            ${submissions.length === 0
              ? `<div class="no-submissions"><i class="fas fa-inbox"></i><p>No submissions yet.</p></div>`
              : submissions.map((s, i) => buildTaskSubmissionCard(s, i)).join('')
            }
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'block';
    modal.querySelector('.close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    // Per-student score saving for tasks
    modal.querySelectorAll('.btn-save-score').forEach(btn => {
      btn.addEventListener('click', async () => {
        const submissionIndex = parseInt(btn.dataset.submissionIndex);
        const scoreInput = modal.querySelector(`#taskScoreInput_${submissionIndex}`);
        const scoreVal = parseFloat(scoreInput.value);

        if (isNaN(scoreVal) || scoreVal < 0) {
          showToast('Please enter a valid score.', 'error');
          scoreInput.classList.add('input-error');
          setTimeout(() => scoreInput.classList.remove('input-error'), 1500);
          return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        // Save score only to this specific student's task submission
        task.submissions[submissionIndex].score = scoreVal;

        await saveAndNotify(`Score saved for ${task.submissions[submissionIndex].studentName || 'student'}!`);

        // Update badge in modal
        const card = modal.querySelector(`.submission-card[data-index="${submissionIndex}"]`);
        const scoreDisplayEl = card.querySelector('.score-display');
        scoreDisplayEl.innerHTML = `<i class="fas fa-check-circle"></i> <strong>${scoreVal}</strong> pts`;
        scoreDisplayEl.className = 'score-display scored';
        card.className = 'submission-card has-score';

        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Saved!';
        btn.classList.add('saved');
        setTimeout(() => { btn.innerHTML = '<i class="fas fa-save"></i> Save Score'; btn.classList.remove('saved'); }, 2000);

        // Update scored count in header
        const scoredCount = task.submissions.filter(s => s.score !== undefined).length;
        const scoredCountEl = modal.querySelector('.task-scored-count');
        if (scoredCountEl) scoredCountEl.textContent = scoredCount;

        renderSubjectDetails(subjectIndex);
      });
    });
  }
  async function deleteItem(subjectIndex, type, itemIndex) {
    const sub = subjects[subjectIndex];
    if (!sub) return;
    const arrayName = `${type}s`;
    if (!sub[arrayName] || sub[arrayName][itemIndex] === undefined) return;
    if (confirm(`Delete this ${type}?`)) {
      sub[arrayName].splice(itemIndex, 1);
      renderSubjectDetails(subjectIndex);
      closeAllModals();
      await saveAndNotify(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted and synced to cloud.`);
    }
  }

  // -------------------------
  // SAVE TO LOCALSTORAGE + FIRESTORE
  // -------------------------

  // Always saves to localStorage immediately.
  // If autoSync=true AND user has a course, also awaits the Firestore write.
  // Returns a Promise so callers can await it and show correct toast timing.
  async function saveSubjects(autoSync = true) {
    localStorage.setItem('subjects', JSON.stringify(subjects));
    if (autoSync && userData?.course) {
      await saveSubjectsToFirestore();
    }
  }

  async function loadSubjectsFromFirestore(courseId) {
    try {
      const docSnap = await getDoc(doc(db, "subjects", courseId));
      if (docSnap.exists()) {
        const cloudSubjects = docSnap.data().subjects;
        if (cloudSubjects && cloudSubjects.length > 0) {
          subjects = cloudSubjects;
        }
        // Sync cloud data down to localStorage (no Firestore write needed)
        localStorage.setItem('subjects', JSON.stringify(subjects));
        renderSubjects();
        console.log('Subjects loaded from Firestore:', subjects.length, 'subjects');
      } else {
        // No cloud data yet — push local data up
        console.log('No Firestore data found, pushing local data up...');
        await saveSubjectsToFirestore();
      }
    } catch (error) {
      console.error("Error loading subjects from Firestore:", error);
      showToast('Could not load from cloud. Using local data.', 'error');
    }
  }

  // Writes subjects array to Firestore and returns the Promise.
  // Throws on failure so callers can catch and show error toasts.
  async function saveSubjectsToFirestore() {
    if (!userData?.course) {
      console.warn('saveSubjectsToFirestore: no course set, skipping.');
      return;
    }
    try {
      await setDoc(doc(db, "subjects", userData.course), {
        subjects: subjects,
        lastUpdated: serverTimestamp()
      });
      console.log('Subjects saved to Firestore for course:', userData.course);
    } catch (error) {
      console.error("Error saving subjects to Firestore:", error);
      showToast('Cloud save failed. Data saved locally only.', 'error');
      throw error; // re-throw so awaiting callers know it failed
    }
  }

  // Realtime listener — updates UI when another user (e.g. instructor) changes data.
  // Uses a flag to avoid overwriting a save that's currently in flight.
  let _isSaving = false;
  function setupRealtimeSubjects(courseId, onUpdate) {
    onSnapshot(doc(db, "subjects", courseId), docSnap => {
      // Don't overwrite while we are mid-save (avoids echo loop)
      if (_isSaving) return;
      if (docSnap.exists()) {
        const cloudSubjects = docSnap.data().subjects;
        if (cloudSubjects && cloudSubjects.length > 0) {
          subjects = cloudSubjects;
          localStorage.setItem('subjects', JSON.stringify(subjects));
          renderSubjects();
          const activeItem = document.querySelector('.subject-list-item.active');
          if (activeItem) renderSubjectDetails(activeItem.dataset.index);
          if (onUpdate) onUpdate(subjects);
          console.log('Realtime update received from Firestore.');
        }
      }
    }, error => console.error("Realtime listener error:", error));
  }

  // Wrapper used everywhere a save + toast is needed.
  // Awaits the full Firestore write before showing success toast.
  async function saveAndNotify(successMsg = 'Saved!') {
    _isSaving = true;
    try {
      await saveSubjects(true);
      showToast(successMsg, 'success');
    } catch (_) {
      // error toast already shown inside saveSubjectsToFirestore
    } finally {
      _isSaving = false;
    }
  }

  // Initial render
  renderSubjects();
}

// =========================
// PROFILE PAGE
// =========================
function initializeProfile() {
  const editBtn = document.getElementById('editProfileBtn');
  const modal = document.getElementById('editProfileModal');
  const closeBtn = document.getElementById('closeModalBtn');
  const cancelBtn = document.getElementById('cancelModalBtn');
  const editForm = document.getElementById('editForm');
  if (!editBtn || !modal || !editForm) return;

  const savedProfile = localStorage.getItem('userProfile');
  if (savedProfile) updateProfileUI(JSON.parse(savedProfile));

  editBtn.addEventListener('click', () => {
    document.getElementById('editName').value = document.getElementById('fullName').textContent;
    document.getElementById('editEmail').value = document.getElementById('infoEmail').textContent;
    document.getElementById('editPhone').value = document.getElementById('infoPhone').textContent;
    document.getElementById('editGender').value = document.getElementById('infoGender').textContent;
    const dobText = document.getElementById('infoDOB').textContent;
    const dateObj = new Date(dobText);
    if (!isNaN(dateObj.getTime())) {
      document.getElementById('editDOB').value = dateObj.toISOString().split('T')[0];
    }
    modal.style.display = 'block';
  });

  const closeModal = () => modal.style.display = 'none';
  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  window.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  editForm.addEventListener('submit', e => {
    e.preventDefault();
    const newData = {
      fullName: document.getElementById('editName').value,
      email: document.getElementById('editEmail').value,
      phone: document.getElementById('editPhone').value,
      dob: document.getElementById('editDOB').value,
      gender: document.getElementById('editGender').value
    };
    const dateObj = new Date(newData.dob);
    const displayDate = !isNaN(dateObj.getTime())
      ? dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : newData.dob;
    const uiData = { ...newData, dob: displayDate };
    updateProfileUI(uiData);
    localStorage.setItem('userProfile', JSON.stringify(uiData));
    const ud = JSON.parse(localStorage.getItem('userData')) || {};
    ud.name = newData.fullName;
    localStorage.setItem('userData', JSON.stringify(ud));
    closeModal();
  });
}

function updateProfileUI(data) {
  if (data.fullName) {
    document.getElementById('fullName').textContent = data.fullName;
    const displayName = document.getElementById('displayName');
    if (displayName) displayName.textContent = data.fullName;
  }
  if (data.email) {
    document.getElementById('infoEmail').textContent = data.email;
    const displayEmail = document.getElementById('displayEmail');
    if (displayEmail) displayEmail.textContent = data.email;
  }
  if (data.phone) document.getElementById('infoPhone').textContent = data.phone;
  if (data.dob) document.getElementById('infoDOB').textContent = data.dob;
  if (data.gender) document.getElementById('infoGender').textContent = data.gender;
}

// =========================
// GRADES
// =========================
function initializeGradesTable() {
  const rows = document.querySelectorAll('.grades-table .table-row');
  rows.forEach(row => {
    row.addEventListener('click', () => {
      rows.forEach(r => { if (r !== row) r.classList.remove('active'); });
      row.classList.toggle('active');
    });
  });
}

function initializeGradesFilter() {
  const controls = document.querySelector('.grades-controls');
  const table = document.querySelector('.grades-table');
  if (!controls || !table) return;
  controls.querySelectorAll('button[data-term]').forEach(button => {
    button.addEventListener('click', () => {
      controls.querySelectorAll('button[data-term]').forEach(b => b.classList.remove('active'));
      button.classList.add('active');
      const term = button.dataset.term;
      table.classList.remove('show-prelim', 'show-midterm', 'show-final');
      if (term !== 'all') table.classList.add(`show-${term}`);
    });
  });
}

// =========================
// INITIALIZE ALL
// =========================
document.addEventListener("DOMContentLoaded", () => {
  initializeTheme();
  initializeLogin();
  initializeSignup();
  initializeRoleToggle();
  initializePasswordToggles();
  initializeDashboard();
  initializeHelp();
  initializeSubjects();
  initializeProfile();
  initializeGradesTable();
  initializeGradesFilter();

  document.getElementById("darkModeBtn")?.addEventListener("click", () => applyTheme("dark"));
  document.getElementById("lightModeBtn")?.addEventListener("click", () => applyTheme("light"));
  document.getElementById("darkThemeBtn")?.addEventListener("click", () => applyTheme("dark"));
  document.getElementById("lightThemeBtn")?.addEventListener("click", () => applyTheme("light"));
  document.getElementById("logoutBtn")?.addEventListener("click", logout);
});

// =========================
// EXPORTS
// =========================
export { logout, applyTheme };

// =========================
// LEGACY SUPABASE SUBMISSION (window global)
// =========================
window.submitStudentFile = async function(subjectId, taskId, file) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { alert("Please login first"); return; }
  const userId = session.user.id;
  const path = `${subjectId}/${taskId}/submissions/${userId}/${file.name}`;
  try {
    const { error } = await supabase.storage.from("files").upload(path, file, { upsert: true });
    if (error) throw error;
    const fileUrl = supabase.storage.from('files').getPublicUrl(path).data.publicUrl;
    await updateDoc(doc(db, "subjects", subjectId, "tasks", taskId), {
      submissions: arrayUnion({ userId, name: file.name, url: fileUrl, time: new Date().toISOString() }),
      updatedAt: serverTimestamp()
    });
    alert("Submission successful!");
  } catch (err) {
    console.error(err);
    alert("Upload failed: " + err.message);
  }
};