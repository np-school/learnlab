let allEnrollments = [];
let currentFilter = "all";
let coursesById = {}; // courseId -> course data (ใช้ดึงรูปปกมาแสดงในรายการ)

guardPage(["user"], (user, profile) => {
  renderShell("user", "my-courses.html", profile);

  db.collection("enrollments").where("uid", "==", user.uid).get().then(snap => {
    allEnrollments = [];
    snap.forEach(doc => allEnrollments.push({ id: doc.id, ...doc.data() }));
    return Promise.all(
      allEnrollments.map(e => db.collection("courses").doc(e.courseId).get().catch(() => null))
    );
  }).then(courseSnaps => {
    coursesById = {};
    (courseSnaps || []).forEach(snap => {
      if (snap && snap.exists) coursesById[snap.id] = snap.data();
    });
    renderList();
  }).catch(err => {
    console.error(err);
    document.getElementById("mcEmpty").style.display = "flex";
  });
});

function setFilter(f) {
  currentFilter = f;
  document.querySelectorAll(".filter-tabs button").forEach(b => b.classList.toggle("active", b.dataset.filter === f));
  renderList();
}

function renderList() {
  const listEl = document.getElementById("mcList");
  const emptyEl = document.getElementById("mcEmpty");
  const items = allEnrollments.filter(e => currentFilter === "all" || e.status === currentFilter);

  if (items.length === 0) {
    listEl.innerHTML = "";
    emptyEl.style.display = "flex";
    return;
  }
  emptyEl.style.display = "none";

  listEl.innerHTML = items.map(e => {
    const done = e.status === "completed";
    const course = coursesById[e.courseId];
    const coverIcon = course && course.coverUrl
      ? `<img src="${course.coverUrl}" alt="">`
      : `<i data-lucide="${done ? "award" : "book-open"}" style="width:22px;height:22px"></i>`;
    return `
    <div class="mc-card">
      <div class="mc-icon">${coverIcon}</div>
      <div class="mc-body">
        <div class="mc-title">${e.courseTitle || "หลักสูตร"}</div>
        <div class="mc-sub">${done ? "เรียนจบแล้ว" : "กำลังเรียน"}${e.enrolledAt && e.enrolledAt.toDate ? " · สมัครเมื่อ " + e.enrolledAt.toDate().toLocaleDateString("th-TH") : ""}</div>
      </div>
      <div class="mc-progress">
        <div class="progress-track"><div class="progress-fill" style="width:${e.progress || 0}%"></div></div>
        <div class="pct">${e.progress || 0}%</div>
      </div>
      <div class="mc-action" style="display:flex;gap:8px;flex-wrap:wrap;">
        <a class="btn-primary" href="course-player.html?id=${e.courseId}"><i data-lucide="${done ? "rotate-ccw" : "play"}" style="width:14px;height:14px"></i>${done ? "ทบทวนบทเรียน" : "เข้าเรียน"}</a>
        ${done
          ? `<button class="btn-secondary" ${e.certificateUrl ? `onclick="window.open('${e.certificateUrl}','_blank')"` : "disabled"}><i data-lucide="award" style="width:14px;height:14px"></i>${e.certificateUrl ? "ดูเกียรติบัตร" : "รอเกียรติบัตร"}</button>`
          : ""}
      </div>
    </div>`;
  }).join("");
  lucide.createIcons();
}
