guardPage(["user"], (user, profile) => {
  renderShell("user", "dashboard.html", profile);

  document.getElementById("profileCard").innerHTML = `
    <img class="profile-avatar" src="${profile.photoURL || ""}" alt="">
    <div>
      <div class="profile-name">สวัสดี, ${profile.name || user.displayName || ""}</div>
      <div class="profile-meta">${profile.organization || ""}${profile.position ? " · " + profile.position : ""}</div>
    </div>`;

  // หลักสูตรเปิดรับสมัครทั้งหมด
  db.collection("courses").where("status", "==", "published").get().then(snap => {
    document.getElementById("statAvailable").textContent = snap.size;
  }).catch(() => {});

  // หลักสูตรที่ผู้ใช้สมัครอยู่
  db.collection("enrollments").where("uid", "==", user.uid).get().then(snap => {
    let enrolled = 0, done = 0;
    const inProgress = [];
    snap.forEach(doc => {
      const d = doc.data();
      enrolled++;
      if (d.status === "completed") done++;
      else inProgress.push(d);
    });
    document.getElementById("statEnrolled").textContent = enrolled;
    document.getElementById("statDone").textContent = done;

    const listEl = document.getElementById("inProgressList");
    const emptyEl = document.getElementById("inProgressEmpty");
    if (inProgress.length === 0) {
      emptyEl.style.display = "flex";
    } else {
      listEl.innerHTML = inProgress.slice(0, 6).map(d => `
        <div class="course-row">
          <div class="course-row-icon"><i data-lucide="book-open" style="width:18px;height:18px"></i></div>
          <div class="course-row-body">
            <div class="course-row-title">${d.courseTitle || "หลักสูตร"}</div>
            <div class="course-row-sub">ความคืบหน้า ${d.progress || 0}%</div>
          </div>
          <div class="course-row-progress">
            <div class="progress-track"><div class="progress-fill" style="width:${d.progress || 0}%"></div></div>
            <div class="pct">${d.progress || 0}%</div>
          </div>
        </div>`).join("");
      lucide.createIcons();
    }
  }).catch(err => {
    console.error(err);
    document.getElementById("inProgressEmpty").style.display = "flex";
  });

  lucide.createIcons();
});
