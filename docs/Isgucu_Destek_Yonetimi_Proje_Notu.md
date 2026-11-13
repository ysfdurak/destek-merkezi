# İşgücü Destek Yönetimi

Kayıt tarihi: 30 Ekim 2026
Durum: Proje havuzu — ileride geliştirmek üzere fikir kaydı.

Amaç: Bölümler arası işgücü destek taleplerini ve gerçekleşen destekleri takip etmek; Excel olarak gelen puantajları ve işlem adetlerini bir araya getirerek adam-saat ve verimlilik hesaplamak.

İlk kapsam:
- Destek isteyen ve destek veren bölüm, tarih/vardiya, talep edilen kişi ve süre bilgileri.
- Gerçekleşen destek personeli ve çalışma sürelerinin takibi.
- Excel puantaj dosyalarının içe alınması.
- Excel işlem adedi dosyalarının içe alınması ve bölüm/tarih/vardiya bazında eşleştirilmesi.
- Adam-saat: kişi bazında net çalışma sürelerinin toplamı.
- Verimlilik: işlem adedi / adam-saat; işlem türleri ayrı değerlendirilir.
- Bölüm bazında verilen/alınan destek ve planlanan/gerçekleşen karşılaştırması.

Destek modülü için ek gereksinimler:
- Kalıcı, ilişkisel veritabanı kullanılacak; teknoloji geliştirme aşamasında seçilecek.
- Bölüm tanımları, lokasyon tanımları ve bölüm–lokasyon ilişkileri tutulacak.
- Personel tanımlarında benzersiz sicil, ad-soyad, bağlı bölüm/lokasyon ve aktiflik bilgisi bulunacak.
- Destek taleplerinde isteyen/veren bölüm ve lokasyon, planlanan başlangıç/bitiş tarih-saatleri ve kişi ihtiyacı tutulacak.
- Gerçekleşen destekler personel bazında başlangıç/bitiş tarih-saatleriyle kaydedilecek; gece yarısını aşan çalışmalar desteklenecek.
- Talep ile gerçekleşen destek kayıtları ilişkilendirilecek; bir talebe birden fazla personel atanabilecek.
- Net destek adam-saati, ilgili aralıktaki molalar düşülerek kişi bazında hesaplanacak; aynı personelin çakışan süreleri iki kez sayılmayacak.
- Raporlama: tarih aralığı, bölüm, lokasyon, personel ve vardiya filtreleri; alınan/verilen destek, destek alan kişi sayısı, toplam destek adam-saati ve planlanan/gerçekleşen farkları.
- İşlem adetleri uygun bölüm/lokasyon/zaman düzeyinde eşleştiğinde verimlilik raporlanacak; kişi bazlı işlem verisi yoksa kişisel verimlilik üretilmeyecek.

Kullanıcı, yetki ve karşı bölüm onayı:
- Kullanıcı hesapları ve rol bazlı yetkilendirme olacak; görüntüleme, kayıt oluşturma/düzenleme, onay/ret, raporlama ve yönetim yetkileri bölüm/lokasyon kapsamıyla tanımlanacak.
- Personel tanımı ile kullanıcı hesabı ayrı tutulacak; her personelin kullanıcı hesabı olması gerekmeyecek.
- Destek kaydı karşı bölümün yetkili kullanıcısının onayına gönderilecek. Kaydı oluşturan kişi karşı bölüm adına kendi kaydını onaylayamayacak.
- Temel onay durumları: Onay bekliyor, Onaylandı, Reddedildi. Onay durumu ile desteğin planlanma/gerçekleşme bilgisi ayrı tutulacak.
- Reddedilen kayıtlar silinmeyecek; yetki kapsamındaki listelerde ve ret/durum raporlarında görülecek, ancak destek adam-saati, gerçekleşen destek toplamı ve destek kaynaklı verimlilik hesaplarına katılmayacak.
- Onay bekleyen kayıtlar ayrı gösterilecek; kesinleşmiş destek hesaplarına yalnızca onaylanmış gerçekleşen süreler alınacak.
- Ret gerekçesi, onaylayan/reddeden kullanıcı, karar tarih-saati ve kayıt değişiklik geçmişi tutulacak.
- Onaylanan kaydın personel, bölüm/lokasyon veya süre gibi hesabı etkileyen bilgileri değiştirilirse yeniden onaya gönderilecek.
- Destek kaydının reddi, Excel puantajındaki fiili çalışma süresini silmeyecek; bu süre bölüm dağılımında çözümlenmemiş olarak işaretlenecek, onaylı destek olarak aktarılmayacak.

Tarih bazlı giriş kontrolü ve dönem açma:
- Geçmiş tarihli destek talebi girişi varsayılan olarak kapalı olacak; kayıt oluşturma zamanı kullanıcı tarafından değiştirilemeyecek.
- Yalnızca admin veya açıkça dönem açma yetkisi verilen kullanıcı, belirli geçmiş tarihleri ya da tarih aralığını girişe açabilecek.
- Açılan destek tarih aralığı ile giriş izninin geçerli olduğu başlangıç/bitiş tarih-saatleri ayrı tutulacak; izin süresi dolunca pencere otomatik kapanacak.
- İzin kapsamı parametrik olacak: admin geçmiş tarihli girişi tüm sistemde herkese, seçili lokasyonlara, seçili bölümlere veya lokasyon–bölüm kombinasyonlarına açabilecek. İstenirse rol/kullanıcı bazında ek sınır konabilecek. Herkese açılış yalnızca tarih kısıtını kaldıracak; mevcut kayıt ve bölüm/lokasyon erişim yetkilerini genişletmeyecek. Genel kayıt yetkisi tek başına geçmiş tarihli giriş hakkı vermeyecek.
- Kontrol desteğin başlangıç/bitiş tarih-saatlerine uygulanacak; gece yarısını aşan kayıtlar vardiya ve dönem kurallarıyla ele alınacak. Tarih değiştirerek kuralın aşılması önlenecek.
- Kapalı dönemlerde hesabı etkileyen düzenleme ve silme de ayrıca yetkilendirilecek; önceki kayıtlar görüntülenebilecek ve raporlanabilecek.
- Adminin açtığı dönemden girilen destekler de karşı bölüm onayından geçecek; dönem açılması otomatik destek onayı anlamına gelmeyecek.
- Dönemi açan/kapatan kullanıcı, gerekçe, izin kapsamı ve geçerlilik süresi kaydedilecek. Geçmiş tarihli giriş yapan kullanıcı ve gerçek kayıt zamanı işlem geçmişinde görülecek.
- Tarih/yetki kontrolleri sunucuda uygulanacak; yalnızca ekran üzerindeki kısıtlamalara dayanılmayacak.

İsteğe bağlı puantaj üzerinden devam ve ihlal kontrolü:
- Excel puantaj verileri kontrol amacıyla veritabanına alınabilecek. Bu kontrol parametrik olarak açılıp kapatılabilecek.
- Personel eşleştirmesi benzersiz sicil üzerinden yapılacak; ad-soyad tek başına eşleştirme anahtarı olmayacak.
- Personeli belirlenmiş destek talepleri ve gerçekleşen destekler puantajla karşılaştırılacak; yalnızca kişi adedi içeren, personeli henüz atanmamış taleplerde personel devam kontrolü yapılmayacak.
- O gün işe gelmediği puantajda açıkça görülen personel için destek kaydı bulunması olası ihlal olarak gösterilecek. Puantajda satır bulunmaması tek başına devamsızlık sayılmayacak; veri eksikliği ayrı uyarı olacak.
- Puantaj giriş/çıkış saatlerini içeriyorsa destek aralığının fiili çalışma aralığı dışında kalması da kontrol edilebilecek. Yalnızca günlük devam bilgisi varsa saat düzeyinde kesin doğrulama yapılmayacak.
- Gece vardiyası ve gece yarısını aşan destekler vardiya tarih eşleştirme kurallarıyla kontrol edilecek.
- İhlal/uyuşmazlık raporunda personel, tarih, destek veren/alan bölüm-lokasyon, destek aralığı, puantaj durumu ve kontrol gerekçesi görülecek; inceleme durumu ve açıklama kaydedilebilecek.
- Puantaj sonradan yüklendiğinde veya güncellendiğinde mevcut destek kayıtları da yeniden kontrol edilecek. Kontrol sonucu ve kullanılan puantaj sürümü/aktarım zamanı izlenebilir olacak.
- İhlal tespiti, otomatik engelleme ve hesap dışına alma ayrı kurallar olacak. Varsayılan davranış kontrol/uyarı ve inceleme olacak; otomatik engelleme veya hesap dışına alma uygulanacaksa ayrıca parametrik olarak belirlenecek. Reddedilen desteklerin hesap dışı tutulması kuralı geçerli kalacak.
- Puantaj ve ihlal detayları yalnızca yetkili kullanıcılarca görülebilecek.

Parametrik otomatik onay ve son gün e-postası:
- Otomatik onay özelliği açılıp kapatılabilecek; bekleme süresi parametrik tanımlanacak. Örnek: 7 gün içinde reddedilmeyen, hâlâ onay bekleyen destek kayıtları süre sonunda sistem tarafından onaylanmış sayılacak.
- Sürenin başlangıcı için önerilen esas, kaydın karşı bölüm onayına gönderildiği tarih-saat olacak; böylece geçmiş tarihli girişlerde inceleme süresi korunacak. Takvim günü/iş günü tercihi ve kesin son tarih-saat kuralı geliştirmede netleştirilecek.
- Son gün, destek yapılan/alan bölümün ilgili lokasyondaki yetkili onay kullanıcılarına e-posta gönderilecek. E-posta son onay/ret tarih-saatini, bekleyen kayıt özetini ve inceleme bağlantısını içerecek.
- Bildirim zamanı parametrik olacak; aynı yetkilinin çok sayıda kaydı varsa tek özet e-postada toplanabilecek. Gönderim durumu ve tekrar denemeler izlenecek.
- Reddedilmiş kayıtlar otomatik onaylanmayacak ve hesaplara alınmayacak. Daha önce elle onaylanan kayıtlar tekrar işlenmeyecek.
- Otomatik onay, onay durumunu Onaylandı yapacak; onay kaynağı Sistem/otomatik olarak saklanacak ve raporlarda elle onaydan ayırt edilebilecek. İşlemin tarih-saati ve uygulanan süre kuralı kaydedilecek.
- Hesaplara yalnızca onaylanmış gerçekleşen destek süresi girecek; otomatik onay planlanan süreyi fiili çalışma süresine dönüştürmeyecek.
- Puantaj ihlali bulunan kayıtlarda otomatik onayın uygulanıp uygulanmayacağı ayrı parametre olacak; önerilen başlangıç kuralı, çözülmemiş ihlali olan kayıtları incelemede tutmak.
- Hesabı etkileyen değişiklik nedeniyle yeniden onaya gönderilen kayıtta onay süresi yeniden başlayacak; değişiklik ve eski karar geçmişi korunacak.

Geliştirmeye başlarken netleştirilecek: Excel örnekleri ve puantaj durum kodları, mola ve fazla mesai kuralları, gün içi bölüm değişiklikleri, kesin rol/yetki matrisi, normal giriş penceresi ve vardiya kapanış kuralları, onayın talep ve/veya gerçekleşme aşamasındaki yeri, otomatik onayın süre/gün/bildirim parametreleri ve aynı sürenin iki bölümde sayılmasını önleyecek eşleştirme kuralları.

Bu kayıt yalnızca hatırlatma ve kapsam notudur; geliştirme takvimi henüz belirlenmedi.
