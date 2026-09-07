function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
  return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
}); }

function doVerify() {
  var certNo = document.getElementById('certNoInput').value.trim();
  if (!certNo) return;
  render('<p style="text-align:center;color:var(--ink-soft);">กำลังตรวจสอบ...</p>');
  // ใช้ certNo เป็น document ID ตรงๆ (ดู functions/index.js) จึงอ่านทีละใบได้โดยไม่ต้อง list ทั้ง collection
  db.collection('training_certificates').doc(certNo).get().then(function(doc) {
    if (!doc.exists) {
      render('<div class="panel" style="text-align:center;border-color:var(--rust);"><p style="color:var(--rust);font-weight:600;">ไม่พบเกียรติบัตรเลขที่นี้ในระบบ</p></div>');
      return;
    }
    var d = doc.data();
    var issued = d.issuedAt && d.issuedAt.toDate ? d.issuedAt.toDate().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : '-';
    render(
      '<div class="cert-sheet">' +
        '<p style="letter-spacing:1px;color:var(--brass-deep);font-size:12px;">เกียรติบัตรฉบับนี้ถูกต้อง</p>' +
        '<h2 style="margin:14px 0 4px;">' + esc(d.userName) + '</h2>' +
        '<p style="color:var(--ink-soft);">ผ่านการอบรมหลักสูตร</p>' +
        '<h3 style="margin:6px 0 18px;">' + esc(d.courseTitle) + '</h3>' +
        '<p style="font-size:13px;">คะแนนที่ได้ ' + d.score + '% · ออกให้เมื่อวันที่ ' + issued + '</p>' +
        '<p class="cert-no">เลขที่ ' + esc(d.certNo) + '</p>' +
      '</div>'
    );
  }).catch(function() {
    render('<div class="panel" style="text-align:center;border-color:var(--rust);"><p style="color:var(--rust);">เกิดข้อผิดพลาด ลองใหม่อีกครั้ง</p></div>');
  });
}

function render(html) { document.getElementById('result').innerHTML = html; }

// ถ้ามี ?cert=XXXX มาจาก QR code ให้ตรวจอัตโนมัติ
(function() {
  var params = new URLSearchParams(window.location.search);
  var cert = params.get('cert');
  if (cert) { document.getElementById('certNoInput').value = cert; doVerify(); }
})();
