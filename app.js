/**
 * Business VCard QR Platform – Core Logic
 * Handles: Auth, CRUD, Encoding, QR Generation, vCard Export
 */

// =====================================================
//  Constants
// =====================================================
const CREDENTIALS = { email: 'admin@vcard.com', password: 'vcard@2024' };
const STORAGE_KEY  = 'bvc_customers';
const SESSION_KEY  = 'bvc_session';

// =====================================================
//  Session / Auth
// =====================================================
function isLoggedIn() {
    return sessionStorage.getItem(SESSION_KEY) === 'true';
}

function login(email, password) {
    if (email === CREDENTIALS.email && password === CREDENTIALS.password) {
        sessionStorage.setItem(SESSION_KEY, 'true');
        return true;
    }
    return false;
}

function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    window.location.href = 'login.html';
}

function requireAuth() {
    if (!isLoggedIn()) {
        window.location.href = 'login.html';
    }
}

// =====================================================
//  Data Persistence
// =====================================================
function loadCustomers() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch { return []; }
}

function saveCustomers(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

// =====================================================
//  Data Encoding / Decoding
// =====================================================
function encodeData(data) {
    try {
        const json = JSON.stringify(data);
        return btoa(unescape(encodeURIComponent(json)));
    } catch (e) {
        console.error('Encode error', e);
        return '';
    }
}

function decodeData(hash) {
    try {
        const json = decodeURIComponent(escape(atob(hash)));
        return JSON.parse(json);
    } catch (e) {
        console.error('Decode error', e);
        return null;
    }
}

// =====================================================
//  URL Builder
// =====================================================
function buildCardURL(data) {
    const hash  = encodeData(data);
    const base  = window.location.href.replace(/\/[^\/]*$/, '/');
    return `${base}card.html#${hash}`;
}

// =====================================================
//  vCard Generator (with base64 photo support)
// =====================================================
function generateVCard(data) {
    const lines = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${data.name || ''}`,
        `N:${(data.name || '').split(' ').reverse().join(';')};;`,
        `ORG:${data.company || ''}`,
        `TITLE:${data.title || ''}`,
        `TEL;TYPE=CELL,VOICE:${data.phone || ''}`,
        `EMAIL;TYPE=WORK,INTERNET:${data.email || ''}`,
    ];

    if (data.website) lines.push(`URL;TYPE=WORK:${data.website}`);
    if (data.linkedin) lines.push(`URL;TYPE=LinkedIn:${data.linkedin}`);
    if (data.whatsapp) lines.push(`X-WHATSAPP:${data.whatsapp}`);
    if (data.customLink) lines.push(`URL;TYPE=${data.customLabel || 'Custom'}:${data.customLink}`);

    // Embed photo in vCard
    if (data.photo && data.photo.startsWith('data:image')) {
        const base64 = data.photo.split(',')[1];
        const mimeRaw = data.photo.split(';')[0].split(':')[1]; // e.g. image/jpeg
        const type = mimeRaw.split('/')[1].toUpperCase(); // JPEG / PNG
        lines.push(`PHOTO;ENCODING=BASE64;TYPE=${type}:${base64}`);
    }

    lines.push('END:VCARD');
    return lines.join('\r\n');
}

function downloadVCard(data) {
    const content = generateVCard(data);
    const blob    = new Blob([content], { type: 'text/vcard;charset=utf-8' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = `${(data.name || 'contact').replace(/\s+/g, '_')}.vcf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 500);
}

// =====================================================
//  Toast Notifications
// =====================================================
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
    const colors = { success: '#22d3a5', error: '#ff4f6b', info: '#6c63ff' };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${icons[type]}" style="color:${colors[type]}"></i><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => toast.remove(), 3200);
}

// =====================================================
//  QR Code Generator
// =====================================================
function renderQR(containerId, url) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    new QRCode(container, {
        text: url,
        width: 220,
        height: 220,
        colorDark: '#6c63ff',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });
}

// =====================================================
//  Modal Utility
// =====================================================
function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
}

// =====================================================
//  ADMIN PAGE LOGIC
// =====================================================
let customers    = [];
let editingId    = null;
let shareUrl     = '';

function initAdmin() {
    requireAuth();
    customers = loadCustomers();
    renderCustomers();
    bindAdminEvents();
}

/* Render the customer grid */
function renderCustomers() {
    const grid = document.getElementById('customer-grid');
    const countEl = document.getElementById('customer-count');
    if (!grid) return;

    if (countEl) countEl.textContent = customers.length;

    if (customers.length === 0) {
        grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
            <div class="empty-icon">👥</div>
            <h3>No Customers Yet</h3>
            <p>Click <strong>+ Add Customer</strong> to create your first digital VCard.</p>
        </div>`;
        return;
    }

    grid.innerHTML = customers.map((c, i) => `
    <div class="customer-card fade-in" style="animation-delay:${i * 0.06}s">
        <img class="customer-avatar" src="${c.photo || 'https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(c.name)}" alt="${c.name}">
        <div class="customer-info">
            <h4>${c.name}</h4>
            <p>${c.company || c.email || ''}</p>
        </div>
        <div class="customer-actions">
            <button class="btn btn-secondary btn-icon" onclick="openShareModal('${c.id}')" title="Share / QR">
                <i class="fa-solid fa-qrcode"></i>
            </button>
            <button class="btn btn-secondary btn-icon" onclick="openEditModal('${c.id}')" title="Edit">
                <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="btn btn-danger btn-icon" onclick="confirmDelete('${c.id}')" title="Delete">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    </div>`).join('');
}

/* Open modal for new customer */
function openAddModal() {
    editingId = null;
    document.getElementById('modal-title').textContent = 'Add New Customer';
    document.getElementById('customer-form').reset();
    resetPhotoPreview();
    openModal('customer-modal');
}

/* Open modal pre-filled for editing */
function openEditModal(id) {
    const c = customers.find(x => x.id === id);
    if (!c) return;
    editingId = id;

    document.getElementById('modal-title').textContent = 'Edit Customer';
    document.getElementById('f-name').value        = c.name        || '';
    document.getElementById('f-company').value     = c.company     || '';
    document.getElementById('f-title').value       = c.title       || '';
    document.getElementById('f-phone').value       = c.phone       || '';
    document.getElementById('f-email').value       = c.email       || '';
    document.getElementById('f-website').value     = c.website     || '';
    document.getElementById('f-linkedin').value    = c.linkedin    || '';
    document.getElementById('f-whatsapp').value    = c.whatsapp    || '';
    document.getElementById('f-custom-label').value = c.customLabel || '';
    document.getElementById('f-custom-link').value = c.customLink  || '';

    // Restore photo preview
    if (c.photo) {
        const preview = document.getElementById('photo-preview');
        preview.src   = c.photo;
        preview.style.display = 'block';
        document.getElementById('photo-placeholder').style.display = 'none';
    } else {
        resetPhotoPreview();
    }

    openModal('customer-modal');
}

/* Save customer (create or update) */
function handleCustomerSubmit(e) {
    e.preventDefault();

    const photoEl = document.getElementById('photo-preview');
    const photo   = (photoEl.style.display !== 'none' && photoEl.src && !photoEl.src.endsWith('#')) ? photoEl.src : '';

    const customer = {
        id:          editingId || Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name:        document.getElementById('f-name').value.trim(),
        company:     document.getElementById('f-company').value.trim(),
        title:       document.getElementById('f-title').value.trim(),
        phone:       document.getElementById('f-phone').value.trim(),
        email:       document.getElementById('f-email').value.trim(),
        website:     document.getElementById('f-website').value.trim(),
        linkedin:    document.getElementById('f-linkedin').value.trim(),
        whatsapp:    document.getElementById('f-whatsapp').value.trim(),
        customLabel: document.getElementById('f-custom-label').value.trim(),
        customLink:  document.getElementById('f-custom-link').value.trim(),
        photo,
        createdAt: editingId
            ? (customers.find(c=>c.id===editingId)?.createdAt || Date.now())
            : Date.now()
    };

    if (editingId) {
        const idx = customers.findIndex(c => c.id === editingId);
        if (idx > -1) customers[idx] = customer;
        showToast('Customer updated successfully!', 'success');
    } else {
        customers.push(customer);
        showToast('Customer created successfully!', 'success');
    }

    saveCustomers(customers);
    closeModal('customer-modal');
    renderCustomers();
}

/* Delete customer */
function confirmDelete(id) {
    const c = customers.find(x => x.id === id);
    if (!c) return;

    // Show confirm in delete modal
    document.getElementById('delete-customer-name').textContent = c.name;
    document.getElementById('confirm-delete-btn').onclick = () => {
        customers = customers.filter(x => x.id !== id);
        saveCustomers(customers);
        closeModal('delete-modal');
        renderCustomers();
        showToast('Customer deleted.', 'info');
    };
    openModal('delete-modal');
}

/* Share / QR modal */
function openShareModal(id) {
    const c = customers.find(x => x.id === id);
    if (!c) return;

    shareUrl = buildCardURL(c);
    document.getElementById('share-link-input').value = shareUrl;
    document.getElementById('share-customer-name').textContent = c.name;

    renderQR('qrcode-container', shareUrl);
    openModal('share-modal');
}

function copyShareLink() {
    const input = document.getElementById('share-link-input');
    input.select();
    document.execCommand('copy');
    showToast('Link copied to clipboard!', 'success');
}

function downloadQR() {
    const canvas = document.querySelector('#qrcode-container canvas');
    const img    = document.querySelector('#qrcode-container img');
    const link   = document.createElement('a');

    if (canvas) {
        link.href     = canvas.toDataURL('image/png');
        link.download = 'vcard_qr.png';
    } else if (img) {
        link.href     = img.src;
        link.download = 'vcard_qr.png';
    }

    link.click();
    showToast('QR Code downloaded!', 'success');
}

/* Photo upload & preview */
function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        const preview = document.getElementById('photo-preview');
        preview.src   = ev.target.result;
        preview.style.display = 'block';
        document.getElementById('photo-placeholder').style.display = 'none';
    };
    reader.readAsDataURL(file);
}

function resetPhotoPreview() {
    const preview = document.getElementById('photo-preview');
    preview.src   = '';
    preview.style.display = 'none';
    document.getElementById('photo-placeholder').style.display = 'flex';
}

/* Bind all admin events */
function bindAdminEvents() {
    // Add button
    document.getElementById('btn-add-customer')?.addEventListener('click', openAddModal);

    // Logout
    document.getElementById('btn-logout')?.addEventListener('click', logout);

    // Customer form submit
    document.getElementById('customer-form')?.addEventListener('submit', handleCustomerSubmit);

    // Photo upload
    document.getElementById('f-photo')?.addEventListener('change', handlePhotoUpload);

    // Modal close buttons
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
    });

    // Copy link button
    document.getElementById('btn-copy-link')?.addEventListener('click', copyShareLink);

    // Download QR button
    document.getElementById('btn-download-qr')?.addEventListener('click', downloadQR);

    // Close modal on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
            }
        });
    });
}

// =====================================================
//  CARD/LANDING PAGE LOGIC
// =====================================================
function initCard() {
    const hash = window.location.hash.substring(1);

    if (!hash) {
        showCardError('No contact data found in this link. Please scan the correct QR code.');
        return;
    }

    const data = decodeData(hash);
    if (!data) {
        showCardError('This link appears to be invalid or corrupted.');
        return;
    }

    renderCard(data);

    document.getElementById('save-contact-btn')?.addEventListener('click', () => {
        downloadVCard(data);
        showToast('Saving contact…', 'success');
    });
}

function renderCard(data) {
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('card-content').style.display  = 'block';

    // Meta
    document.title = `${data.name} | Digital Business Card`;
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.content = `View ${data.name}'s digital business card and add to contacts.`;

    // Profile
    const photo = document.getElementById('profile-photo');
    if (data.photo) {
        photo.src = data.photo;
        photo.onerror = () => { photo.src = getInitialsAvatar(data.name); };
    } else {
        photo.src = getInitialsAvatar(data.name);
    }

    document.getElementById('profile-name').textContent    = data.name    || 'Name';
    document.getElementById('profile-company').textContent = data.company
        ? (data.title ? `${data.title} @ ${data.company}` : data.company)
        : (data.title || '');

    // Quick action links
    setLink('qbtn-call',  `tel:${data.phone}`,      data.phone);
    setLink('qbtn-email', `mailto:${data.email}`,   data.email);
    setLink('qbtn-wa',    `https://wa.me/${(data.whatsapp || data.phone || '').replace(/\D/g,'')}`, data.whatsapp || data.phone);

    if (data.linkedin) {
        const liBtn = document.getElementById('qbtn-linkedin');
        if (liBtn) { liBtn.href = data.linkedin; liBtn.style.display = 'flex'; }
    }

    // Detail rows
    setDetailRow('det-phone', data.phone, `tel:${data.phone}`);
    setDetailRow('det-email', data.email, `mailto:${data.email}`);
    setDetailRow('det-website', data.website && data.website.replace(/^https?:\/\//, ''), data.website);
    setDetailRow('det-linkedin', data.linkedin && prettyLink(data.linkedin), data.linkedin);
    setDetailRow('det-wa',  data.whatsapp, `https://wa.me/${(data.whatsapp||'').replace(/\D/g,'')}`);
    setDetailRow('det-custom', data.customLabel ? `${data.customLabel}` : data.customLink && prettyLink(data.customLink), data.customLink);
}

function setLink(id, href, visible) {
    const el = document.getElementById(id);
    if (!el) return;
    if (visible) {
        el.href = href;
        el.style.display = 'flex';
    } else {
        el.style.display = 'none';
    }
}

function setDetailRow(id, text, href) {
    const row = document.getElementById(id);
    if (!row) return;
    if (text) {
        const valEl = row.querySelector('.detail-value');
        if (valEl) valEl.textContent = text;
        if (href) row.href = href;
        row.style.display = 'flex';
    } else {
        row.style.display = 'none';
    }
}

function prettyLink(url) {
    try {
        return new URL(url).hostname.replace('www.', '');
    } catch { return url; }
}

function getInitialsAvatar(name) {
    return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || 'NA')}&backgroundColor=6c63ff&textColor=ffffff`;
}

function showCardError(msg) {
    document.getElementById('loading-state').style.display  = 'none';
    const err = document.getElementById('error-state');
    if (err) {
        err.style.display = 'flex';
        const p = err.querySelector('p');
        if (p) p.textContent = msg;
    }
}

// =====================================================
//  LOGIN PAGE LOGIC
// =====================================================
function initLogin() {
    if (isLoggedIn()) {
        window.location.href = 'admin.html';
        return;
    }

    const form   = document.getElementById('login-form');
    const errMsg = document.getElementById('error-msg');

    form?.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const pass  = document.getElementById('login-password').value;

        if (login(email, pass)) {
            window.location.href = 'admin.html';
        } else {
            errMsg.classList.add('show');
            form.classList.add('shake');
            setTimeout(() => form.classList.remove('shake'), 500);
        }
    });

    // Hide error on input
    document.getElementById('login-email')?.addEventListener('input',    () => errMsg.classList.remove('show'));
    document.getElementById('login-password')?.addEventListener('input', () => errMsg.classList.remove('show'));
}

// =====================================================
//  Auto-Initialize based on page
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.page;
    if (page === 'login')  initLogin();
    if (page === 'admin')  initAdmin();
    if (page === 'card')   initCard();
});
