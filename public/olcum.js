// Anonim kullanım ölçümü ve geri bildirim (ortak servis: olcum.ysfdurak.com; kaynak: ysfdurak.com → sunucu/olcum).
// Sunucu bu dosyayı yalnız herkese açık demoda (DEMO_MODE) sayfaya ekler; kurum kurulumunda hiç yüklenmez.
// Ayrıca yalnız resmî demo adresinde çalışır. Gönderilenler: ekran adı (genel bakış, onay kutusu, dashboard…),
// aktif süre, cihaz türü, dil. Personel, bölüm, destek kayıtları, ad, e-posta ve IP gönderilmez; çerez yok; DNT/GPC'ye uyar.
// Ekran adını uygulama bildirir: app/ui.tsx → window.olcumKuyruk.push(['ekran', page]).
(function () {
  if (location.hostname !== 'destek.ysfdurak.com') return;
  window.olcumKuyruk = window.olcumKuyruk || [];
  var s = document.createElement('script');
  s.src = 'https://olcum.ysfdurak.com/olcum.js';
  s.defer = true;
  s.dataset.proje = 'destek';
  s.dataset.renk = '#087f72';
  document.head.appendChild(s);
})();
