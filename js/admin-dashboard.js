guardPage(["staff"], (user, profile) => {
  renderShell("staff", "admin-dashboard.html", profile);

  db.collection("users").get().then(snap => {
    document.getElementById("statUsers").textContent = snap.size;
    let instructors = 0;
    snap.forEach(doc => { if ((doc.data().roles || []).includes("instructor")) instructors++; });
    document.getElementById("statInstructors").textContent = instructors;
  }).catch(() => {});

  db.collection("courses").get().then(snap => {
    document.getElementById("statCourses").textContent = snap.size;
  }).catch(() => {});

  db.collection("enrollments").get().then(snap => {
    document.getElementById("statEnrollments").textContent = snap.size;
  }).catch(() => {});
});
