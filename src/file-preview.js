export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
export const MAX_FILE_SIZE = 20 * 1024 * 1024;

export function validateFile(file) {
  if (!file) return 'ファイルを選択してください。';
  const extensionOK = /\.(jpg|jpeg|png|pdf)$/i.test(file.name || '');
  if (!ACCEPTED_TYPES.includes(file.type) && !extensionOK) return 'JPG、JPEG、PNG、PDFのみ選択できます。';
  if (file.size > MAX_FILE_SIZE) return 'ファイルサイズは20MB以下にしてください。';
  return '';
}
export function isPdf(mimeType, fileName = '') { return mimeType === 'application/pdf' || /\.pdf$/i.test(fileName); }
export function clearPreview(container) { container.replaceChildren(); }
export function renderPreview(container, file, label = '') {
  clearPreview(container); if (!file) { container.innerHTML = '<p class="empty-preview">原本ファイルを選択するとここに表示されます。</p>'; return null; }
  const url = URL.createObjectURL(file);
  const node = isPdf(file.type, file.name) ? Object.assign(document.createElement('iframe'), { src: url, title: label || file.name }) : Object.assign(document.createElement('img'), { src: url, alt: label || file.name });
  container.append(node); return url;
}

