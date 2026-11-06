export const vi = {
  brandTitle: 'BlobToon Việt Nam',
  nav: {
    studio: 'Trình Soạn Kịch Bản (.script.txt)',
    gallery: 'Kho Nhân Vật (Blob & Robot)',
    batch: 'Kết Xuất Hàng Loạt',
    cli: 'Lệnh CLI & Schema JSON',
  },
  header: {
    aspectLabel: 'Chọn tỷ lệ khung hình',
    allAspectsOption: 'Tất cả (4 tỷ lệ)',
    sfxMuteAria: 'Tắt hiệu ứng âm thanh',
    sfxUnmuteAria: 'Bật hiệu ứng âm thanh',
    sfxOn: 'SFX BẬT',
    sfxOff: 'SFX TẮT',
    sfxVolumeAria: 'Âm lượng SFX',
    renderingBtn: 'Đang xuất MP4...',
    renderBtn: 'Xuất Video MP4 & Ảnh Bìa',
    langToggleAria: 'Chuyển đổi ngôn ngữ',
  },
  banner: {
    close: 'Đóng',
  },
  notices: {
    emptyScriptError:
      'Vui lòng nhập nội dung kịch bản (.script.txt) trước khi biên dịch Timeline.',
    compileFailedError: 'Biên dịch kịch bản thất bại',
    compileSuccess: (scenes: number, sec: number, aspect: string, provider: string) =>
      `Hợp lệ! Đã dựng ${scenes} cảnh (${sec}s, tỷ lệ ${aspect}) với ${provider} TTS.`,
    compileFallbackSuccess: (scenes: number, sec: number) =>
      `Đã kiểm tra hợp lệ và dựng ${scenes} cảnh (${sec}s) trực tiếp trên trình duyệt.`,
    saveProjectFailed: 'Không thể lưu dự án',
    saveProjectSuccess: (filePath: string) => `Đã lưu kịch bản vào ${filePath}`,
    auditionFailed: 'Không thể tổng hợp giọng thử',
    auditionSuccess: (voice: string, sec: number, provider: string) =>
      `Đã tạo âm thanh thử giọng "${voice}" (${sec}s qua ${provider}).`,
    renderingAllAspects:
      'Đang kết xuất cả 4 tỷ lệ khung hình (9:16, 16:9, 4:3, 3:4) ở 30fps...',
    renderingGallery: (w: number, h: number) =>
      `Đang kết xuất Video Bộ Sưu Tập (${w}x${h} @ 30fps)...`,
    renderingSingle: (w: number, h: number, aspect: string) =>
      `Đang kết xuất ${w}x${h} (${aspect}) @ 30fps MP4 + Ảnh Bìa PNG...`,
    renderFailed: 'Kết xuất thất bại',
    renderAllSuccess:
      'Đã kết xuất đủ 4 tỷ lệ khung hình (out_9x16.mp4, out_16x9.mp4, out_4x3.mp4, out_3x4.mp4) và ảnh bìa.',
    renderSingleSuccess: (w: number, h: number, aspect: string, fps: number, sec: number) =>
      `Đã kết xuất ${w}x${h} (${aspect}) ${fps}fps MP4 (${sec}s) và Ảnh Bìa PNG.`,
    emptyBatchPathsError:
      'Vui lòng nhập ít nhất một đường dẫn tệp kịch bản (.script.txt / .script.json).',
    batchFailedError: 'Chạy hàng loạt thất bại',
  },
  editor: {
    sectionTitle: 'Trình Soạn Kịch Bản Thủ Công (.script.txt)',
    projectSelectLabel: 'Mở kịch bản mẫu hoặc dự án trong projects/<slug>/script.txt',
    addSceneBtn: '+ Cảnh Mới',
    addLineBtn: '+ Lời Thoại',
    saveProjectBtn: 'Lưu projects/',
    paletteLabel: 'Bảng Màu Sơn Mài',
    skillLabel: 'Skill Render Params',
    defaultSkillOption: 'Mặc định (Chuẩn)',
    compilingBtn: 'Đang kiểm tra cú pháp & tổng hợp TTS...',
    compileBtn: 'Kiểm Tra Cú Pháp & Dựng Timeline',
    scenesCount: (count: number) => `${count} Cảnh`,
    wordsCount: (count: number) => `${count} Từ`,
    sceneBreakdownTitle: (count: number) => `Danh Sách Cảnh Trong Kịch Bản (${count})`,
    totalDuration: (sec: number) => `Tổng ${sec}s`,
    charactersInSceneCount: (count: number) => `${count} nhân vật`,
  },
  stage: {
    thumbnailPreviewTitle: (w: number, h: number) => `Ảnh Bìa (${w}×${h})`,
    stageTitle: (aspect: string, label: string) => `Sân Khấu (${aspect}): ${label}`,
    safeZonesBtn: 'Vùng An Toàn',
    thumbnailModeBtn: 'Xem Ảnh Bìa',
    pauseAria: 'Tạm dừng xem trước',
    playAria: 'Phát xem trước',
    restartAria: 'Phát lại từ khung hình 0',
    scrubberAria: 'Thanh tua khung hình timeline',
    frameCounter: (current: number, total: number) => `Khung hình ${current} / ${total}`,
  },
  audition: {
    title: 'Thử Giọng Đọc VoiceStudio (npm run say)',
    precedenceHint: 'line > char > script > env',
    textInputAria: 'Câu thoại thử giọng',
    voiceInputAria: 'Tên giọng đọc VoiceStudio',
    synthesizingBtn: 'Đang tổng hợp...',
    sayBtn: 'Nghe Thử Giọng (Say)',
  },
  inspector: {
    sceneTitle: (label: string) => `Chỉnh Sửa Cảnh: ${label}`,
    frameRange: (start: number, end: number) => `Khung ${start}–${end}`,
    backgroundLabel: 'Bối Cảnh SVG',
    transitionLabel: 'Hiệu Ứng Chuyển Cảnh',
    captionLabel: 'Lời Thoại & Phụ Đề Tô Sáng Từng Từ (Fredoka OFL)',
    charactersHeader: (count: number) => `Nhân Vật Trong Cảnh (${count})`,
    characterTypeAria: (name: string) => `Kiểu nhân vật của ${name}`,
    characterColorAria: (name: string) => `Màu của nhân vật ${name}`,
    emotionLabel: 'Cảm xúc',
    accessoryLabel: 'Phụ kiện',
    animationLabel: 'Chuyển động',
    voiceLabel: 'Giọng (Voice)',
  },
  deliverables: {
    title: 'Thành Phẩm Đã Kết Xuất (out/)',
    defaultTtsStatus: 'MockProvider Sẵn Sàng',
    videoLabel: (res: string) => `Video MP4 (${res})`,
    thumbnailLabel: 'Ảnh Bìa PNG',
    thumbnailAlt: 'Ảnh bìa đã kết xuất',
    allRatiosHeader: 'Đã xuất đủ 4 tỷ lệ khung hình:',
    downloadVideoBtn: 'Tải Video MP4',
    downloadThumbnailBtn: 'Tải Ảnh Bìa PNG',
    emptyStatePrompt:
      'Chọn tỷ lệ khung hình (`9:16`, `16:9`, `4:3`, `3:4`, hoặc `Tất cả`) và nhấn "Xuất Video MP4 & Ảnh Bìa" để ghép âm thanh và xuất thành phẩm.',
    renderingNowBtn: 'Đang kết xuất...',
    renderCurrentTimelineBtn: 'Kết Xuất Timeline Hiện Tại',
  },
  gallery: {
    title: 'Kho Nhân Vật Đăng Ký Qua defineCharacter (Blob & Robot) & Đạo Cụ SVG',
    subtitlePrefix: 'Mọi nhân vật trong',
    subtitleSuffix:
      'được tự động đăng ký với điểm neo (anchors: feet, head, bubble) cho mọi tỷ lệ khung hình.',
    renderingGalleryBtn: 'Đang xuất video bộ sưu tập...',
    renderGalleryBtn: 'Xuất Video Trình Diễn Bộ Sưu Tập',
    blobSectionTitle: '01. Nhân Vật `blob` (Classic Squishy Blob — `src/characters/Blob.tsx`)',
    robotSectionTitle: '02. Nhân Vật `robot` (BoxBot 3000 Square Robot — `src/characters/Robot.tsx`)',
    propSectionTitle: '03. Kho Đạo Cụ Mở Rộng (`defineProp` — 8 Đạo Cụ SVG Động)',
    bgSectionTitle: (aspect: string) => `04. Sáu Bối Cảnh Sân Khấu Đa Tỷ Lệ (${aspect})`,
  },
  batch: {
    title: 'Kết Xuất Hàng Loạt Từ Tệp Kịch Bản (.script.txt / .script.json)',
    descriptionPrefix: 'Nhập danh sách đường dẫn tệp kịch bản (mỗi dòng 1 tệp) hoặc chạy',
    descriptionSuffix: '. Mỗi kịch bản được gán một biến thể bảng màu riêng biệt.',
    pathsLabel: 'Danh Sách Đường Dẫn Kịch Bản (Mỗi dòng 1 tệp)',
    runningBtn: 'Đang dựng timeline hàng loạt...',
    runBtn: 'Dựng Timeline Hàng Loạt Từ Danh Sách Kịch Bản',
    resultsHeader: (count: number) => `Kết Quả Lô Kịch Bản (${count} Bảng Màu)`,
    itemStats: (scenes: number, sec: number, frames: number) =>
      `${scenes} cảnh · ${sec}s · ${frames} frames`,
    openInStageBtn: 'Mở Trong Sân Khấu',
  },
  cli: {
    title: 'Lệnh CLI Thủ Công (Script In → Video Out)',
    step1Title: '1. Tạo Dự Án Mới & Kiểm Tra Cú Pháp Kịch Bản',
    step2Title: '2. Kết Xuất Kịch Bản Ra MP4 + Ảnh Bìa + Meta JSON',
    step3Title: '3. Danh Sách Giọng Đọc & Nghe Thử VoiceStudio',
    liveTimelineTitle: (aspect: string) => `Live Timeline JSON (${aspect})`,
    liveTimelineMeta: (scenes: number, frames: number, seed: number) =>
      `${scenes} cảnh · ${frames} frames · seed ${seed}`,
  },
};

export type UiDictionary = typeof vi;
