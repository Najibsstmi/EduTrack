-- Descriptor umum dijana daripada public/PENERANGAN TAHAP PENGUASAAN.xlsx.
-- Override sekolah menggunakan school_id tertentu dan tidak disentuh oleh seed ini.

delete from public.pbd_tp_descriptors
where school_id is null
  and tingkatan is null
  and subject_name in (
    'BAHASA INGGERIS',
    'BAHASA MELAYU',
    'MATEMATIK',
    'PENDIDIKAN ISLAM',
    'PENDIDIKAN MORAL',
    'PJPK',
    'SAINS',
    'SEJARAH',
    'SENI VISUAL',
    'SENI TARI',
    'SENI MUZIK',
    'SENI TEATER'
  );

insert into public.pbd_tp_descriptors (school_id, tingkatan, subject_name, tp_level, statement)
values
  (null, null, 'BAHASA INGGERIS', 1, 'Pupil displays minimal ability to achieve the curriculum target.'),
  (null, null, 'BAHASA INGGERIS', 2, 'Pupil is on track to achieve the curriculum target.'),
  (null, null, 'BAHASA INGGERIS', 3, 'Pupil achieves expectations of  the curriculum target.'),
  (null, null, 'BAHASA INGGERIS', 4, 'Pupil works towards exceeding expectations of the curriculum target.'),
  (null, null, 'BAHASA INGGERIS', 5, 'Pupil is on track to exceed expectations of the curriculum target.'),
  (null, null, 'BAHASA INGGERIS', 6, 'Pupil exceeds expectations of the curriculum target.'),
  (null, null, 'BAHASA MELAYU', 1, 'Murid mempamerkan tahap pengetahuan bahasa dan kecekapan berbahasa yang sangat lemah, sangat terhad dan memerlukan banyak bimbingan, panduan dan latihan dalam kemahiran bahasa.'),
  (null, null, 'BAHASA MELAYU', 2, 'Murid mempamerkan tahap pengetahuan bahasa dan kecekapan berbahasa yang lemah, terhad dan memerlukan sedikit bimbingan, panduan, dan latihan dalam kemahiran bahasa.'),
  (null, null, 'BAHASA MELAYU', 3, 'Murid berupaya mempamerkan tahap pengetahuan bahasa dan kecekapan berbahasa yang sederhana dan berupaya mengungkapkan idea serta menguasai kemahiran berfikir yang asas tanpa bimbingan dalam kemahiran bahasa.'),
  (null, null, 'BAHASA MELAYU', 4, 'Murid berupaya mempamerkan tahap pengetahuan bahasa dan kecekapan berbahasa yang baik, dapat mengaplikasikan pengetahuan bahasa dengan berkesan, berupaya mengungkapkan idea, menguasai kemahiran berfikir yang kritis, dan mengamalkan pembelajaran kendiri secara minimum dalam kemahiran bahasa.'),
  (null, null, 'BAHASA MELAYU', 5, 'Murid berupaya mempamerkan tahap pengetahuan bahasa dan kecekapan berbahasa yang tinggi, berupaya mengungkapkan idea dengan jelas dan terperinci, berkomunikasi secara efektif, mengaplikasikan pengetahuan bahasa yang lebih kompleks, menguasai kemahiran berfikir yang kritis dan kreatif, serta mengamalkan pembelajaran secara kendiri dalam kemahiran bahasa.'),
  (null, null, 'BAHASA MELAYU', 6, 'Murid berupaya mempamerkan tahap pengetahuan bahasa dan kecekapan berbahasa yang cemerlang dan konsisten, berupaya mengungkapkan idea dengan jelas, terperinci dan tersusun, menguasai kemahiran berfikir yang kritis, kreatif dan inovatif, berkomunikasi secara efektif dan penuh keyakinan, mengamalkan pembelajaran secara kendiri serta menjadi model teladan kepada murid yang lain dalam kemahiran bahasa.'),
  (null, null, 'MATEMATIK', 1, 'Murid boleh menjawab soalan yang mana semua maklumat berkaitan diberi dan soalan ditakrifkan dengan jelas; mengenal pasti maklumat dan menjalankan prosedur rutin mengikut arahan yang jelas.'),
  (null, null, 'MATEMATIK', 2, 'Murid boleh mengenal dan mentafsirkan situasi secara langsung; menggunakan suatu perwakilan tunggal; menggunakan algoritma, rumus, prosedur atau kaedah asas; membuat penaakulan langsung dan membuat pentafsiran bagi keputusan yang diperoleh.'),
  (null, null, 'MATEMATIK', 3, 'Murid boleh melaksanakan prosedur yang dinyatakan dengan jelas, termasuk prosedur yang berlapis; mengaplikasikan strategi penyelesaian masalah yang mudah; mentafsir dan menggunakan perwakilan berdasarkan sumber maklumat yang berbeza; menaakul secara langsung dan berkomunikasi secara ringkas dalam memberikan pentafsiran, keputusan dan penaakulan.'),
  (null, null, 'MATEMATIK', 4, 'Murid boleh menggunakan secara berkesan model eksplisit bagi situasi kompleks yang konkrit; memilih dan mengintegrasikan perwakilan yang berbeza dan mengaitkan dengan situasi dunia sebenar; menggunakan kemahiran dan menaakul secara fleksibel berdasarkan kefahaman yang mendalam dan berkomunikasi dengan penerangan dan hujah berdasarkan pentafsiran, perbincangan dan tindakan.'),
  (null, null, 'MATEMATIK', 5, 'Murid boleh membangun dan menggunakan model bagi situasi kompleks; mengenal pasti kekangan dan membuat andaian yang spesifik; mengaplikasi strategi penyelesaian masalah yang sesuai; bekerja secara strategik menggunakan kemahiran berfikir dan menaakul secara mendalam; menggunakan pelbagai perwakilan yang sesuai serta mempamerkan kefahaman yang mendalam; membuat refleksi terhadap keputusan dan tindakan; merumus dan berkomunikasi dengan penerangan dan hujah berdasarkan pentafsiran, perbincangan dan tindakan.'),
  (null, null, 'MATEMATIK', 6, 'Murid boleh mengkonsepsi, membuat generalisasi dan menggunakan maklumat berdasarkan penyiasatan dan pemodelan terhadap situasi masalah yang kompleks; menghubung kait sumber maklumat dan perwakilan yang berbeza dan menukarkan bentuk perwakilan antara satu dengan yang lain secara fleksibel; memiliki pemikiran matematik dan kemahiran menaakul pada tahap yang tinggi; mempamerkan kefahaman yang mendalam, membentuk pendekatan dan strategi baharu untuk menangani situasi baharu; merumus dan berkomunikasi dengan penerangan dan hujah berdasarkan pentafsiran, perbincangan, refleksi dan tindakan secara tepat.'),
  (null, null, 'PENDIDIKAN ISLAM', 1, 'Mengetahui perkara asas, atau boleh melakukan kemahiran asas, atau memberi respons terhadap perkara asas yang berkaitan Pendidikan Islam.'),
  (null, null, 'PENDIDIKAN ISLAM', 2, 'Menunjukkan kefahaman berkaitan Pendidikan Islam dengan menjelaskan sesuatu perkara yang dipelajari dalam pelbagai bentuk komunikasi.'),
  (null, null, 'PENDIDIKAN ISLAM', 3, 'Menggunakan pengetahuan berkaitan Pendidikan Islam untuk melaksanakan sesuatu kemahiran pada suatu situasi.'),
  (null, null, 'PENDIDIKAN ISLAM', 4, 'Menganalisis dan mengamalkan sesuatu ilmu dan kemahiran berkaitan Pendidikan Islam.'),
  (null, null, 'PENDIDIKAN ISLAM', 5, 'Menilai dan mengamalkan sesuatu ilmu dan kemahiran berkaitan Pendidikan Islam pada situasi baharu dengan beradab.'),
  (null, null, 'PENDIDIKAN ISLAM', 6, 'Berupaya menggunakan pengetahuan dan kemahiran berkaitan Pendidikan Islam sedia ada untuk digunakan pada situasi baharu secara beradab dan istiqamah'),
  (null, null, 'PENDIDIKAN MORAL', 1, 'Murid tahu perkara asas atau boleh melakukan kemahiran asas atau memberi tindak balas terhadap perkara asas.'),
  (null, null, 'PENDIDIKAN MORAL', 2, 'Murid menunjukkan kefahaman untuk menukar bentuk komunikasi atau menterjemah serta menjelaskan perkara yang telah dipelajari.'),
  (null, null, 'PENDIDIKAN MORAL', 3, 'Murid menggunakan pengetahuan untuk melaksanakan sesuatu kemahiran pada sesuatu situasi.'),
  (null, null, 'PENDIDIKAN MORAL', 4, 'Murid melaksanakan sesuatu kemahiran dengan beradab, iaitu mengikut prosedur atau secara sistematik.'),
  (null, null, 'PENDIDIKAN MORAL', 5, 'Murid melaksanakan sesuatu kemahiran pada situasi baharu dengan mengikut prosedure atau secara sistematik serta tekal dan bersikap positif.'),
  (null, null, 'PENDIDIKAN MORAL', 6, 'Murid berupaya menggunakan pengetahuan dan kemahiran sedia ada untuk digunakan pada situasi baharu secara sistematik, bersikap positif, kreatif dan inovatif serta boleh dicontohi.'),
  (null, null, 'PJPK', 1, 'Murid boleh meniru atau melakukan kemahiran asas melibatkan pergerakan berirama, kemahiran asas permainan ragbi sentuh; bola keranjang; hoki; badminton; ping pong; sofbol; aktiviti rekreasi ikhtiar hidup memasak makanan, melakukan aktiviti menggunakan bola kecergasan atau bermain permainan tradisonal Hoki Terbang dan Usung Balak; aktiviti kecergasan fizikal yang ditunjukkan atau tahu perkara asas tentang sesuatu kemahiran yang akan dilakukan.
Murid mengetahui kepentingan literasi kesihatan dalam mengurus kesihatan dan keselamatan diri.'),
  (null, null, 'PJPK', 2, 'Murid boleh melakukan kemahiran pergerakan berirama, kemahiran asas permainan ragbi sentuh; bola keranjang; hoki; badminton; ping pong; sofbol; aktiviti rekreasi ikhtiar hidup memasak makanan, melakukan aktiviti menggunakan bola kecergasan atau bermain permainan tradisonal Hoki Terbang dan Usung Balak; aktiviti kecergasan fizikal  serta menyatakan pengetahuan berkaitan fakta, konsep, dan prosedur bagi sesuatu kemahiran atau aktiviti kecergasan.
Murid memahami kepentingan literasi kesihatan dalam mengurus kesihatan dan keselamatan diri.'),
  (null, null, 'PJPK', 3, 'Murid boleh mengingat semula dan mengaplikasikan pengetahuan berkaitan fakta, konsep, prinsip, prosedur, strategi, teknik, dan maklumat semasa melakukan sesuatu kemahiran melibatkan pergerakan berirama, kemahiran asas permainan ragbi sentuh; bola keranjang; hoki; badminton; ping pong; sofbol; aktiviti rekreasi ikhtiar hidup memasak makanan, melakukan aktiviti menggunakan bola kecergasan atau bermain permainan tradisonal Hoki Terbang dan Usung Balak; aktiviti kecergasan fizikal atau aktiviti kecergasan.
Murid berupaya mengaplikasi kemahiran kecekapan psikososial dalam mengurus kesihatan dan keselamatan diri.'),
  (null, null, 'PJPK', 4, 'Murid boleh mengaplikasikan pengetahuan berkaitan fakta, konsep, prinsip, prosedur, strategi, teknik dan maklumat semasa melakukan sesuatu kemahiran melibatkan pergerakan berirama, kemahiran asas permainan ragbi sentuh; bola keranjang; hoki; badminton; ping pong; sofbol; aktiviti rekreasi ikhtiar hidup memasak makanan, melakukan aktiviti menggunakan bola kecergasan atau bermain permainan tradisonal Hoki Terbang dan Usung Balak; aktiviti kecergasan fizikal  atau aktiviti kecergasan dengan turutan yang betul atau mengikut prosedur yang sistematik.
Murid berupaya menganalisis maklumat, produk dan perkhidmatan kesihatan bagi meningkatkan pengurusan penjagaan diri, kesihatan dan keselamatan diri.'),
  (null, null, 'PJPK', 5, 'Murid boleh merancang sesuatu aktiviti yang baharu atau mengimprovisasi berdasarkan pengetahuan dan kemahiran melibatkan pergerakan berirama, kemahiran asas permainan ragbi sentuh; bola keranjang; hoki; badminton; ping pong; sofbol; aktiviti rekreasi ikhtiar hidup memasak makanan, melakukan aktiviti menggunakan bola kecergasan atau bermain permainan tradisonal Hoki Terbang dan Usung Balak; aktiviti kecergasan fizikal dan tahap kecergasan fizikal, melakukan aktiviti tersebut secara tekal, dan mempamerkan kemahiran interpersonal.
Murid berupaya menilai kemahiran kecekapan psikososial yang bersesuaian dalam mengurus kesihatan dan keselamatan diri.'),
  (null, null, 'PJPK', 6, 'Murid boleh membuat justifikasi berdasarkan strategi untuk meningkatkan prestasi dalam kemahiran pergerakan berirama, kemahiran asas permainan ragbi sentuh; bola keranjang; hoki; badminton; ping pong; sofbol; aktiviti rekreasi ikhtiar hidup memasak makanan, melakukan aktiviti menggunakan bola kecergasan atau bermain permainan tradisonal Hoki Terbang dan Usung Balak; aktiviti kecergasan fizikal, kecergasan dan mempamerkan kemahiran interpersonal serta boleh mempraktikkan kemahiran tersebut ke arah gaya hidup sihat untuk kesejahteraan.
Murid berupaya menyampaikan maklumat berkaitan kesihatan dan keselamatan diri kepada ahli keluarga, rakan sebaya dan masyarakat dalam meningkatkan literasi kesihatan, kesejahteraan hidup serta jangka hayat panjang dan berkualiti.'),
  (null, null, 'SAINS', 1, 'Murid tahu perkara asas atau boleh melakukan kemahiran asas atau memberi respons terhadap perkara yang asas dalam bidang sains.'),
  (null, null, 'SAINS', 2, 'Murid menunjukkan kefahaman dengan menjelaskan sesuatu perkara yang dipelajari dalam bentuk komunikasi dalam bidang Sains.'),
  (null, null, 'SAINS', 3, 'Murid menggunakan pengetahuan untuk melaksanakan sesuatu kemahiran pada suatu situasi dalam bidang sains.'),
  (null, null, 'SAINS', 4, 'Murid menggunakan pengetahuan dan melaksanakan sesuatu kemahiran dengan beradab iaitu mengikut prosedur atau secara analitik dan sistematik dalam bidang sains.'),
  (null, null, 'SAINS', 5, 'Murid menggunakan pengetahuan dan melaksanakan sesuatu kemahiran pada situasi baharu dengan mengikut prosedur atau secara sistematik serta tekal dan bersikap positif dalam bidang sains.'),
  (null, null, 'SAINS', 6, 'Murid berupaya menggunakan pengetahuan  dan kemahiran sedia ada untuk digunakan pada situasi baharu secara sistematik, bersikap positif, kreatif dan inovatif dalam penghasilan idea baharu serta boleh dicontohi dalam bidang sains.'),
  (null, null, 'SEJARAH', 1, 'Mengetahui secara mendalam berkaitan  ilmu sejarah, kemahiran dan nilai yang dipelajari.'),
  (null, null, 'SEJARAH', 2, 'Mempamerkan kefahaman secara mendalam berkaitan ilmu sejarah, kemahiran dan nilai yang dipelajari dengan contoh.'),
  (null, null, 'SEJARAH', 3, 'Menyusun maklumat secara mendalam berkaitan berkaitan ilmu sejarah, kemahiran dan nilai yang dipelajari.'),
  (null, null, 'SEJARAH', 4, 'Menganalisis maklumat secara mendalam berkaitan ilmu sejarah, kemahiran dan nilai yang dipelajari.'),
  (null, null, 'SEJARAH', 5, 'Membuat penilaian secara mendalam berkaitan ilmu sejarah, kemahiran dan nilai yang dipelajari dengan kehidupan masa kini.'),
  (null, null, 'SEJARAH', 6, 'Menjana  idea berkaitan ilmu sejarah, kemahiran dan nilai yang dipelajari untuk menghadapi cabaran akan datang secara mendalam (holistik)'),
  (null, null, 'SENI VISUAL', 1, 'Mengenal pasti bahasa seni visual, media, teknik dan proses dalam penghasilan karya.'),
  (null, null, 'SENI VISUAL', 2, 'Menerangkan tentang bahasa seni visual, teknik, media dan proses dalam penghasilan karya.'),
  (null, null, 'SENI VISUAL', 3, 'Mengaplikasikan kefahaman dan kemahiran bahasa seni visual, media, teknik dan proses dalam penghasilan karya serta mengamalkan nilai murni.'),
  (null, null, 'SENI VISUAL', 4, 'Menganalisis aplikasi bahasa seni visual, media, teknik dan proses dalam penghasilan karya melalui eksplorasi dan penjanaan idea serta mengamalkan nilai murni.'),
  (null, null, 'SENI VISUAL', 5, 'Menjustifikasikan aplikasi bahasa seni visual, media, teknik dan proses dalam penghasilan karya melalui pengolahan idea serta mengamalkan nilai murni.'),
  (null, null, 'SENI VISUAL', 6, 'Mencipta hasil karya secara kreatif, inovatif dan mengamalkan nilai murni dengan mengaplikasi bahasa seni visual, media, teknik dan proses serta mampu membuat apresiasi secara intelektual/ ilmiah.'),
  (null, null, 'SENI TARI', 1, 'Meniru aktiviti pelaziman tubuh dan gerak olah tubuh.'),
  (null, null, 'SENI TARI', 2, 'Melakukan aktiviti pelaziman tubuh dengan betul.'),
  (null, null, 'SENI TARI', 3, 'Melakukan aktiviti pelaziman tubuh dan tiga daripada sembilan gerak olah tubuh dengan teknik yang betul.'),
  (null, null, 'SENI TARI', 4, 'Melakukan aktiviti pelaziman tubuh dan lima daripada sembilan gerak olah tubuh dengan teknik yang betul.'),
  (null, null, 'SENI TARI', 5, 'Melakukan aktiviti pelaziman tubuh dan tujuh daripada sembilan gerak olah tubuh dengan teknik yang betul.'),
  (null, null, 'SENI TARI', 6, 'Melakukan aktiviti pelaziman tubuh dan kesemua gerak olah tubuh yang dipelajari dengan teknik yang betul secara konsisten.'),
  (null, null, 'SENI MUZIK', 1, '• Menyanyikan lagu secara unison.
• Menerima nilai murni, disiplin individu dan etika performer.'),
  (null, null, 'SENI MUZIK', 2, '• Menyanyikan lagu secara unison dengan pic yang betul mengikut tempo.
• Menerima nilai murni, disiplin individu dan etika performer.'),
  (null, null, 'SENI MUZIK', 3, '• Menyanyikan lagu secara unison atau dua lapisan suara dengan pic dan teknik yang betul mengikut
   tempo.
• Menerima dan mempamerkan nilai murni, disiplin individu dan etika performer.'),
  (null, null, 'SENI MUZIK', 4, '• Menyanyikan lagu secara unison dan dua lapisan suara dengan pic dan teknik yang betul serta dinamik 
   yang sesuai mengikut tempo.
• Mengamalkan nilai murni, disiplin individu dan etika performer.'),
  (null, null, 'SENI MUZIK', 5, '• Menyanyikan lagu secara unison dan dua lapisan dengan pic dan teknik yang betul serta dinamik yang
   sesuai mengikut tempo secara konsisten.
• Sentiasa mengamalkan nilai murni, disiplin individu dan etika performer.'),
  (null, null, 'SENI MUZIK', 6, '• Menyanyikan lagu secara unison dan dua lapisan suara dengan pic dan teknik yang betul serta dinamik 
   yang sesuai mengikut tempo secara ekspresif dan konsisten.
• Sentiasa mengamalkan nilai murni, disiplin individu dan etika performer serta menjadi contoh kepada 
   murid yang lain.'),
  (null, null, 'SENI TEATER', 1, '•  Meniru watak.
•  Mempamerkan disiplin dalam aktiviti teater.'),
  (null, null, 'SENI TEATER', 2, '• Melakonkan watak ATAU mengimprovisasikan watak  
• Mempamerkan disiplin dalam aktiviti teater.'),
  (null, null, 'SENI TEATER', 3, '• Melakonkan watak DAN mengimprovisasikan watak.
• Mempamerkan disiplin dalam aktiviti teater.'),
  (null, null, 'SENI TEATER', 4, '• Berlakon dalam kumpulan dengan mengaplikasikan kemahiran asas lakon.
 • Mengamalkan disiplin dalam aktiviti teater.'),
  (null, null, 'SENI TEATER', 5, '• Berlakon dalam kumpulan dengan mengaplikasikan kemahiran asas lakon dan prinsip asas blocking.
 • Mengamalkan disiplin dalam aktiviti teater.'),
  (null, null, 'SENI TEATER', 6, '• Berlakon dalam kumpulan berdasarkan watak dan perwatakan dengan meyakinkan. 
• Mengamalkan disiplin dalam aktiviti teater.');
