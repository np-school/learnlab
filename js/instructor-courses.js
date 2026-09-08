guardPage(["instructor"], (user, profile) => {
  renderShell("instructor", "instructor-courses.html", profile);

  db.collection("courses").where("ownerUid", "==", user.uid).get().then(snap => {
    const gridEl = document.getElementById("ownedGrid");
    const emptyEl = document.getElementById("ownedEmpty");
    if (snap.empty) { emptyEl.style.display = "flex"; return; }

    const statusBadge = { published: '<span class="badge green">เปิดใช้งาน</span>', draft: '<span class="badge gray">ฉบับร่าง</span>' };

    gridEl.innerHTML = snap.docs.map(doc => {
      const c = doc.data();
      return `
      <div class="course-card">
        <div class="course-cover"><i data-lucide="book-open" style="width:34px;height:34px"></i></div>
        <div class="course-body">
          <div class="course-cat">${c.category || "หลักสูตรอบรม"}</div>
          <div class="course-title">${c.title || "ไม่มีชื่อหลักสูตร"}</div>
          <div class="course-desc">${c.description || "ยังไม่มีคำอธิบายหลักสูตร"}</div>
          <div class="course-footer">
            ${statusBadge[c.status] || statusBadge.draft}
            <a class="btn-secondary" href="course-manage.html?id=${doc.id}"><i data-lucide="settings-2" style="width:14px;height:14px"></i>จัดการ</a>
          </div>
        </div>
      </div>`;
    }).join("");
    lucide.createIcons();
  }).catch(err => {
    console.error(err);
    document.getElementById("ownedEmpty").style.display = "flex";
  });
});
