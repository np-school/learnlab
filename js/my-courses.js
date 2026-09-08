let allEnrollments = [];
let currentFilter = "all";

guardPage(["user"], (user, profile) => {
  renderShell("user", "my-courses.html", profile);

  db.collection("enrollments").where("uid", "==", user.uid).get().then(snap => {
    allEnrollments = [];
    snap.forEach(doc => allEnrollments.push({ id: doc.id, ...doc.data() }));
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
    return `
    <div class="mc-card">
      <div class="mc-icon"><i data-lucide="${done ? "award" : "book-open"}" style="width:22px;height:22px"></i></div>
      <div class="mc-body">
        <div class="mc-title">${e.courseTitle || "หลักสูตร"}</div>
        <div class="mc-sub">${done ? "เรียนจบแล้ว" : "กำลังเรียน"}${e.enrolledAt && e.enrolledAt.toDate ? " · สมัครเมื่อ " + e.enrolledAt.toDate().toLocaleDateString("th-TH") : ""}</div>
      </div>
      <div class="mc-progress">
        <div class="progress-track"><div class="progress-fill" style="width:${e.progress || 0}%"></div></div>
        <div class="pct">${e.progress || 0}%</div>
      </div>
      <div class="mc-action">
        ${done
          ? `<button class="btn-secondary" ${e.certificateUrl ? `onclick="window.open('${e.certificateUrl}','_blank')"` : "disabled"}><i data-lucide="award" style="width:14px;height:14px"></i>${e.certificateUrl ? "ดูเกียรติบัตร" : "รอเกียรติบัตร"}</button>`
          : `<span class="badge sky">กำลังเรียน</span>`}
      </div>
    </div>`;
  }).join("");
  lucide.createIcons();
}
