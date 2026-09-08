let currentUser = null;
let allCourses = [];
let myEnrolledIds = new Set();

guardPage(["user"], (user, profile) => {
  renderShell("user", "courses.html", profile);
  currentUser = user;

  Promise.all([
    db.collection("courses").where("status", "==", "published").get(),
    db.collection("enrollments").where("uid", "==", user.uid).get()
  ]).then(([courseSnap, enrollSnap]) => {
    allCourses = [];
    courseSnap.forEach(doc => allCourses.push({ id: doc.id, ...doc.data() }));
    myEnrolledIds = new Set();
    enrollSnap.forEach(doc => myEnrolledIds.add(doc.data().courseId));
    renderCourses();
  }).catch(err => {
    console.error(err);
    document.getElementById("courseEmpty").style.display = "flex";
  });
});

function renderCourses() {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  const gridEl = document.getElementById("courseGrid");
  const emptyEl = document.getElementById("courseEmpty");
  const items = allCourses.filter(c => !q || (c.title || "").toLowerCase().includes(q));

  if (items.length === 0) {
    gridEl.innerHTML = "";
    emptyEl.style.display = "flex";
    return;
  }
  emptyEl.style.display = "none";

  gridEl.innerHTML = items.map(c => {
    const enrolled = myEnrolledIds.has(c.id);
    return `
    <div class="course-card">
      <div class="course-cover"><i data-lucide="book-open" style="width:34px;height:34px"></i></div>
      <div class="course-body">
        <div class="course-cat">${c.category || "หลักสูตรอบรม"}</div>
        <div class="course-title">${c.title || "ไม่มีชื่อหลักสูตร"}</div>
        <div class="course-desc">${c.description || "ยังไม่มีคำอธิบายหลักสูตร"}</div>
        <div class="course-meta"><i data-lucide="user" style="width:12px;height:12px"></i>${c.ownerName || "ผู้สร้างหลักสูตร"}</div>
        <div class="course-footer">
          <span class="badge sky">เปิดรับสมัคร</span>
          ${enrolled
            ? `<a class="btn-secondary" href="my-courses.html"><i data-lucide="check" style="width:14px;height:14px"></i>สมัครแล้ว</a>`
            : `<button class="btn-primary" onclick="enroll('${c.id}','${(c.title || "").replace(/'/g, "\\'")}')"><i data-lucide="plus" style="width:14px;height:14px"></i>สมัครเรียน</button>`}
        </div>
      </div>
    </div>`;
  }).join("");
  lucide.createIcons();
}

function enroll(courseId, courseTitle) {
  const enrollId = currentUser.uid + "_" + courseId;
  db.collection("enrollments").doc(enrollId).set({
    uid: currentUser.uid,
    courseId,
    courseTitle,
    status: "in_progress",
    progress: 0,
    enrolledAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    myEnrolledIds.add(courseId);
    showToast("สมัครเรียนเรียบร้อย", "success");
    renderCourses();
  }).catch(err => showToast("สมัครไม่สำเร็จ: " + err.message, "error"));
}
