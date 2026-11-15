import React from 'react';
import { Paperclip, X, FileImage, FileText } from 'lucide-react';

/**
 * Reusable multi-file attachment picker & previewer (Payment Screenshots, Cheque Photos, Bank Slips).
 * Resizes large photos client-side before encoding to base64 so mobile uploads are fast.
 */
export default function AttachmentUploader({ attachments, setAttachments, label = 'Attachments (Payment Screenshot, Cheque Photo, Bank Slip)' }) {
  const readAndCompress = (file) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (!file.type.startsWith('image/') || file.size < 600 * 1024) {
        resolve({
          file_name: file.name,
          mime_type: file.type || 'image/png',
          attachment_type: 'payment_screenshot',
          data_base64: result,
        });
        return;
      }
      const img = new Image();
      img.onload = () => {
        const maxDim = 1280;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.8);
        resolve({
          file_name: file.name,
          mime_type: 'image/jpeg',
          attachment_type: 'payment_screenshot',
          data_base64: compressed,
        });
      };
      img.onerror = () => resolve({
        file_name: file.name,
        mime_type: file.type || 'image/png',
        attachment_type: 'payment_screenshot',
        data_base64: result,
      });
      img.src = result;
    };
    reader.readAsDataURL(file);
  });

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const processed = await Promise.all(files.map(readAndCompress));
    setAttachments([...attachments, ...processed]);
    e.target.value = '';
  };

  const updateType = (idx, attachment_type) => {
    setAttachments(attachments.map((a, i) => (i === idx ? { ...a, attachment_type } : a)));
  };

  const removeAt = (idx) => {
    setAttachments(attachments.filter((_, i) => i !== idx));
  };

  return (
    <div style={{ marginTop: 10, padding: 10, border: '1px dashed #cbd5e1', borderRadius: 8, background: '#f8fafc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Paperclip size={14} /> {label}
        </span>
        <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer', margin: 0 }}>
          + Add Photos / Files
          <input
            type="file"
            multiple
            accept="image/*,application/pdf"
            onChange={handleFiles}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {attachments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {attachments.map((att, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#ffffff', padding: 6, borderRadius: 6, border: '1px solid #e2e8f0' }}>
              {att.mime_type.startsWith('image/') ? (
                <img src={att.data_base64} alt={att.file_name} style={{ width: 38, height: 38, objectFit: 'cover', borderRadius: 4, border: '1px solid #e2e8f0' }} />
              ) : (
                <div style={{ width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eff6ff', borderRadius: 4 }}>
                  <FileText size={18} color="#2563eb" />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <FileImage size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />{att.file_name}
                </div>
                <select
                  className="form-control"
                  style={{ padding: '2px 6px', fontSize: 11, marginTop: 3, height: 24 }}
                  value={att.attachment_type}
                  onChange={e => updateType(idx, e.target.value)}
                >
                  <option value="payment_screenshot">Payment Screenshot</option>
                  <option value="cheque_photo">Cheque Photo</option>
                  <option value="bank_slip">Bank Transfer Slip</option>
                  <option value="other">Other Document</option>
                </select>
              </div>
              <button type="button" className="btn btn-outline btn-sm" style={{ padding: '4px 6px' }} onClick={() => removeAt(idx)}>
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

