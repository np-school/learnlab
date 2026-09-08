let editUser = null;
let editCourseId = null;

guardPage(["instructor"], (user, profile) => {
  renderShell("instructor", "course-manage.html", profile);
  editUser = user;

  const params = new URLSearchParams(window.location.search);
  editCourseId = params.get("id");
  if (editCourseId) {
    document.getElementById("pageTitle").textContent = "แก้ไขหลักสูตร";
    db.collection("courses").doc(editCourseId).get().then(snap => {
      if (!snap.exists) { showToast("ไม่พบหลักสูตรนี้", "error"); return; }
      const c = snap.data();
      document.getElementById("cTitle").value = c.title || "";
      document.getElementById("cDesc").value = c.description || "";
      document.getElementById("cCategory").value = c.category || "";
      document.getElementById("cStatus").value = c.status || "draft";
    });
  }
  lucide.createIcons();
});

function saveCourse() {
  const title = document.getElementById("cTitle").value.trim();
  if (!title) { showToast("กรุณากรอกชื่อหลักสูตร", "error"); return; }

  const data = {
    title,
    description: document.getElementById("cDesc").value.trim(),
    category: document.getElementById("cCategory").value.trim(),
    status: document.getElementById("cStatus").value,
    ownerUid: editUser.uid,
    ownerName: editUser.displayName || editUser.email,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  const ref = editCourseId ? db.collection("courses").doc(editCourseId) : db.collection("courses").doc();
  const isNew = !editCourseId;
  if (isNew) data.createdAt = firebase.firestore.FieldValue.serverTimestamp();

  ref.set(data, { merge: true }).then(() => {
    showToast("บันทึกหลักสูตรเรียบร้อย", "success");
    setTimeout(() => { window.location.href = "instructor-courses.html"; }, 700);
  }).catch(err => showToast("บันทึกไม่สำเร็จ: " + err.message, "error"));
}
