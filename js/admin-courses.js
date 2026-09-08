let allAdminCourses = [];

guardPage(["staff"], (user, profile) => {
  renderShell("staff", "admin-courses.html", profile);

  Promise.all([
    db.collection("courses").get(),
    db.collection("enrollments").get()
  ]).then(([courseSnap, enrollSnap]) => {
    const countByCourse = {};
    enrollSnap.forEach(doc => {
      const cid = doc.data().courseId;
      countByCourse[cid] = (countByCourse[cid] || 0) + 1;
    });
    allAdminCourses = courseSnap.docs.map(doc => ({ id: doc.id, enrollCount: countByCourse[doc.id] || 0, ...doc.data() }));
    document.getElementById("courseCount").textContent = "(" + allAdminCourses.length + ")";
    renderCourseTable();
  }).catch(err => {
    console.error(err);
    document.getElementById("courseEmpty").style.display = "flex";
  });
});

function renderCourseTable() {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  const bodyEl = document.getElementById("courseBody");
  const emptyEl = document.getElementById("courseEmpty");
  const items = allAdminCourses.filter(c =>
    !q || (c.title || "").toLowerCase().includes(q) || (c.ownerName || "").toLowerCase().includes(q)
  );

  if (items.length === 0) {
    bodyEl.innerHTML = "";
    emptyEl.style.display = "flex";
    return;
  }
  emptyEl.style.display = "none";

  const statusBadge = { published: '<span class="badge green">เปิดใช้งาน</span>', draft: '<span class="badge gray">ฉบับร่าง</span>' };

  bodyEl.innerHTML = items.map(c => `
    <tr>
      <td><b>${c.title || "-"}</b></td>
      <td>${c.category || "-"}</td>
      <td>${c.ownerName || "-"}</td>
      <td>${statusBadge[c.status] || statusBadge.draft}</td>
      <td>${c.enrollCount}</td>
      <td style="text-align:left;">
        <button class="btn-secondary" onclick="toggleStatus('${c.id}','${c.status}')">
          <i data-lucide="${c.status === "published" ? "eye-off" : "eye"}" style="width:14px;height:14px"></i>
          ${c.status === "published" ? "ซ่อน" : "เผยแพร่"}
        </button>
      </td>
    </tr>`).join("");
  lucide.createIcons();
}

function toggleStatus(courseId, currentStatus) {
  const newStatus = currentStatus === "published" ? "draft" : "published";
  db.collection("courses").doc(courseId).update({ status: newStatus }).then(() => {
    const c = allAdminCourses.find(x => x.id === courseId);
    if (c) c.status = newStatus;
    showToast("เปลี่ยนสถานะหลักสูตรเรียบร้อย", "success");
    renderCourseTable();
  }).catch(err => showToast("เปลี่ยนสถานะไม่สำเร็จ: " + err.message, "error"));
}
