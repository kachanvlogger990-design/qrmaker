/**
 * Business VCard QR Platform – Core Logic
 * Handles: Auth, CRUD, Encoding, QR Generation, vCard Export
 */

// =====================================================
//  Constants & Firebase Initialization
// =====================================================
const CREDENTIALS = { email: 'admin@vcard.com', password: 'vcard@2024' };
const SESSION_KEY = 'bvc_session';
const FB_KEY = 'bvc_firebase_config';

let db = null;

function initFirebase() {
    const firebaseConfig = {
        apiKey: "AIzaSyATSMf9-oYQaJ2QKNRP0V9lluolBPD8e0I",
        authDomain: "qr-code-builder-7e8cd.firebaseapp.com",
        databaseURL: "https://qr-code-builder-7e8cd-default-rtdb.firebaseio.com",
        projectId: "qr-code-builder-7e8cd",
        storageBucket: "qr-code-builder-7e8cd.firebasestorage.app",
        messagingSenderId: "699915597337",
        appId: "1:699915597337:web:e035a768e96780b89e1c88",
        measurementId: "G-SGMTPHY3RT"
    };

    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.database();
        return true;
    } catch (e) {
        console.error("Firebase init failed:", e);
        return false;
    }
}
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
//  Data Persistence (Firebase)
// =====================================================
async function loadCustomers() {
    if (!db) return [];
    try {
        const snapshot = await db.ref('customers').once('value');
        const data = snapshot.val();
        if (!data) return [];
        return Object.values(data);
    } catch (e) {
        console.error("Failed to load customers:", e);
        showToast('Error loading from Firebase', 'error');
        return [];
    }
}

async function saveCustomers(list) {
    if (!db) return;
    try {
        const updates = {};
        list.forEach(c => { updates[c.id] = c; });
        await db.ref('customers').set(updates);
    } catch (e) {
        console.error("Failed to save to Firebase:", e);
        throw e;
    }
}

// =====================================================
//  Data Encoding / Decoding (Legacy Fallback)
// =====================================================
function encodeData(data) {
    try { return btoa(unescape(encodeURIComponent(JSON.stringify(data)))); } catch { return ''; }
}

function decodeData(hash) {
    try { return JSON.parse(decodeURIComponent(escape(atob(hash)))); } catch { return null; }
}

// =====================================================
//  URL Builder (Using IDs instead of huge hashes)
// =====================================================
function buildCardURL(data) {
    const base = window.location.href.replace(/\/[^\/]*$/, '/');
    return `${base}card.html?id=${data.id}`;
}

// =====================================================
//  vCard Generator (with base64 photo support)
// =====================================================
// =====================================================
//  vCard Generator (with standards compliance & mobile fixes)
// =====================================================
function foldLine(line) {
    const maxLen = 75;
    if (line.length <= maxLen) return line;
    let folded = line.substring(0, maxLen);
    for (let i = maxLen; i < line.length; i += maxLen - 1) {
        folded += "\r\n " + line.substring(i, i + maxLen - 1);
    }
    return folded;
}

function generateVCard(data) {
    const nameParts = (data.name || '').trim().split(/\s+/);
    const lastName = nameParts.length > 1 ? nameParts.pop() : '';
    const firstName = nameParts.join(' ');

    const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const uid = data.id || `u_${Date.now().toString(36)}`;

    let vcard = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        'PRODID:-//Digital Business Card Manager//EN',
        `REV:${now}`,
        `UID:${uid}`,
        `FN;CHARSET=UTF-8:${data.name || ''}`,
        `N;CHARSET=UTF-8:${lastName};${firstName};;;`,
    ];

    if (data.company) vcard.push(`ORG;CHARSET=UTF-8:${data.company}`);
    if (data.title) vcard.push(`TITLE;CHARSET=UTF-8:${data.title}`);
    if (data.phone) vcard.push(`TEL;TYPE=CELL,VOICE:${data.phone.replace(/\s+/g, '')}`);
    if (data.email) vcard.push(`EMAIL;TYPE=WORK,INTERNET:${data.email}`);
    if (data.website) vcard.push(`URL;TYPE=WORK:${data.website}`);

    if (data.linkedin) {
        vcard.push(`URL;TYPE=LinkedIn:${data.linkedin}`);
        vcard.push(`X-SOCIALPROFILE;TYPE=linkedin:${data.linkedin}`);
    }

    if (data.whatsapp) {
        const waNum = data.whatsapp.replace(/\D/g, '');
        vcard.push(`TEL;TYPE=WHATSAPP:${data.whatsapp}`);
        vcard.push(`X-SOCIALPROFILE;TYPE=whatsapp:https://wa.me/${waNum}`);
    }

    if (data.gpay) {
        vcard.push(`item1.TEL:${data.gpay}`);
        vcard.push(`item1.X-ABLabel:Google Pay`);
    }

    if (data.location) {
        vcard.push(`item2.URL:${data.location}`);
        vcard.push(`item2.X-ABLabel:Location`);
    }

    if (data.customFields && Array.isArray(data.customFields)) {
        data.customFields.forEach((field, index) => {
            if (field.label && field.link) {
                const idx = index + 3;
                vcard.push(`item${idx}.URL:${field.link}`);
                vcard.push(`item${idx}.X-ABLabel:${field.label}`);
            }
        });
    }

    const notes = [];
    if (data.whatsapp) notes.push(`WhatsApp: ${data.whatsapp}`);
    if (data.gpay) notes.push(`Google Pay: ${data.gpay}`);
    if (data.location) notes.push(`Location: ${data.location}`);
    if (data.customFields) {
        data.customFields.forEach(f => { if (f.label && f.link) notes.push(`${f.label}: ${f.link}`); });
    }
    if (notes.length > 0) {
        vcard.push(`NOTE;CHARSET=UTF-8:Additional Details:\\n${notes.join('\\n')}`);
    }

    if (data.photo && data.photo.startsWith('data:image')) {
        const parts = data.photo.split(',');
        const base64 = parts[1];
        const mime = parts[0].split(';')[0].split(':')[1];
        const type = mime.split('/')[1].toUpperCase();
        vcard.push(`PHOTO;TYPE=${type};ENCODING=b:${base64}`);
    }

    vcard.push('END:VCARD');

    // Fold lines and join
    return vcard.map(foldLine).join('\r\n') + '\r\n';
}

function downloadVCard(data) {
    try {
        const content = generateVCard(data);
        const filename = `${(data.name || 'contact').replace(/\s+/g, '_')}.vcf`;
        const blob = new Blob([content], { type: 'text/vcard;charset=utf-8' });

        if (window.navigator && window.navigator.msSaveOrOpenBlob) {
            window.navigator.msSaveOrOpenBlob(blob, filename);
            return;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();

        // Safety delay
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 1000);
    } catch (e) {
        console.error("VCard download failed:", e);
        showToast("Export failed. Please try again.", "error");
    }
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
        colorDark: '#000000',
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
let customers = [];
let editingId = null;
let shareUrl = '';

async function initAdmin() {
    requireAuth();

    // Init Firebase
    initFirebase();

    if (db) {
        customers = await loadCustomers();
        renderCustomers();
    } else {
        showToast("Database connection failed. Please check config.", "error");
    }

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
    <div class="customer-card fade-in" style="animation-delay:${i * 0.06}s; ${c.isActive === false ? 'opacity:0.6;' : ''}">
        <img class="customer-avatar" src="${c.photo || 'https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(c.name)}" alt="${c.name}">
        <div class="customer-info">
            <h4>${c.name}</h4>
            <p>${c.company || c.email || ''}</p>
            ${c.isActive === false ? '<span style="font-size:0.65rem; background:rgba(255,79,107,0.15); color:var(--danger); padding:2px 8px; border-radius:12px; margin-top:6px; border:1px solid rgba(255,79,107,0.3);">Inactive</span>' : ''}
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
    document.getElementById('f-isactive').checked = true;
    document.getElementById('dynamic-fields-container').innerHTML = '';
    resetPhotoPreview();
    openModal('customer-modal');
}

/* Open modal pre-filled for editing */
function openEditModal(id) {
    const c = customers.find(x => x.id === id);
    if (!c) return;
    editingId = id;

    document.getElementById('modal-title').textContent = 'Edit Customer';
    document.getElementById('f-name').value = c.name || '';
    document.getElementById('f-company').value = c.company || '';
    document.getElementById('f-title').value = c.title || '';
    document.getElementById('f-phone').value = c.phone || '';
    document.getElementById('f-email').value = c.email || '';
    document.getElementById('f-website').value = c.website || '';
    document.getElementById('f-location').value = c.location || '';
    document.getElementById('f-linkedin').value = c.linkedin || '';
    document.getElementById('f-whatsapp').value = c.whatsapp || '';
    document.getElementById('f-gpay').value = c.gpay || '';

    // Render dynamic fields
    renderDynamicFields(c.customFields || []);

    document.getElementById('f-isactive').checked = c.isActive !== false;

    // Restore photo preview
    if (c.photo) {
        const preview = document.getElementById('photo-preview');
        preview.src = c.photo;
        preview.style.display = 'block';
        document.getElementById('photo-placeholder').style.display = 'none';
    } else {
        resetPhotoPreview();
    }

    openModal('customer-modal');
}

/* Save customer (create or update) */
async function handleCustomerSubmit(e) {
    e.preventDefault();

    if (!db) {
        showToast('Firebase not connected! Please provide config in Settings.', 'error');
        return;
    }

    const btn = document.querySelector('#customer-form button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    try {
        const photoEl = document.getElementById('photo-preview');
        const photo = (photoEl.style.display !== 'none' && photoEl.src && !photoEl.src.endsWith('#')) ? photoEl.src : '';

        const customer = {
            id: editingId || `u_${Date.now().toString(36)}`,
            name: document.getElementById('f-name').value.trim(),
            company: document.getElementById('f-company').value.trim(),
            title: document.getElementById('f-title').value.trim(),
            phone: document.getElementById('f-phone').value.trim(),
            email: document.getElementById('f-email').value.trim(),
            website: document.getElementById('f-website').value.trim(),
            location: document.getElementById('f-location').value.trim(),
            linkedin: document.getElementById('f-linkedin').value.trim(),
            whatsapp: document.getElementById('f-whatsapp').value.trim(),
            gpay: document.getElementById('f-gpay').value.trim(),
            customFields: collectDynamicFields(),
            isActive: document.getElementById('f-isactive').checked,
            photo,
            createdAt: editingId
                ? (customers.find(c => c.id === editingId)?.createdAt || Date.now())
                : Date.now()
        };

        if (editingId) {
            const idx = customers.findIndex(c => c.id === editingId);
            if (idx > -1) customers[idx] = customer;
        } else {
            customers.push(customer);
        }

        await saveCustomers(customers);
        showToast(editingId ? 'Customer updated!' : 'Customer created!', 'success');

        closeModal('customer-modal');
        renderCustomers();
    } catch (e) {
        showToast('Error saving data', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

/* Delete customer */
function confirmDelete(id) {
    const c = customers.find(x => x.id === id);
    if (!c) return;

    document.getElementById('delete-customer-name').textContent = c.name;
    document.getElementById('confirm-delete-btn').onclick = async () => {
        if (!db) return;

        const btn = document.getElementById('confirm-delete-btn');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        customers = customers.filter(x => x.id !== id);
        await db.ref(`customers/${id}`).remove();

        closeModal('delete-modal');
        renderCustomers();
        showToast('Customer deleted.', 'info');
        btn.innerHTML = 'Yes, Delete';
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
    const img = document.querySelector('#qrcode-container img');
    const link = document.createElement('a');

    if (canvas) {
        link.href = canvas.toDataURL('image/png');
        link.download = 'vcard_qr.png';
    } else if (img) {
        link.href = img.src;
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
        preview.src = ev.target.result;
        preview.style.display = 'block';
        document.getElementById('photo-placeholder').style.display = 'none';
    };
    reader.readAsDataURL(file);
}

function resetPhotoPreview() {
    const preview = document.getElementById('photo-preview');
    preview.src = '';
    preview.style.display = 'none';
    document.getElementById('photo-placeholder').style.display = 'flex';
}

// Dynamic Fields Helpers
function addDynamicFieldRow(data = { label: '', link: '' }) {
    const container = document.getElementById('dynamic-fields-container');
    const row = document.createElement('div');
    row.className = 'form-row dynamic-field-row';
    row.style.marginTop = '12px';
    row.innerHTML = `
        <div class="form-group" style="flex:1; margin-bottom:0;">
            <input type="text" class="form-control df-label" placeholder="Label (e.g. Instagram)" value="${data.label}">
        </div>
        <div class="form-group" style="flex:2; margin-bottom:0;">
            <input type="url" class="form-control df-link" placeholder="URL (https://...)" value="${data.link}">
        </div>
        <button type="button" class="btn btn-danger btn-icon" onclick="this.closest('.dynamic-field-row').remove()" style="margin-top:0; height:42px;">
            <i class="fa-solid fa-trash"></i>
        </button>
    `;
    container.appendChild(row);
}

function renderDynamicFields(fields) {
    const container = document.getElementById('dynamic-fields-container');
    container.innerHTML = '';
    fields.forEach(f => addDynamicFieldRow(f));
}

function collectDynamicFields() {
    const fields = [];
    document.querySelectorAll('.dynamic-field-row').forEach(row => {
        const label = row.querySelector('.df-label').value.trim();
        const link = row.querySelector('.df-link').value.trim();
        if (label || link) fields.push({ label, link });
    });
    return fields;
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

    // Add dynamic field row
    document.getElementById('btn-add-field')?.addEventListener('click', () => addDynamicFieldRow());

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
async function initCard() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const hash = window.location.hash.substring(1);

    if (!id && !hash) {
        showCardError('No contact data found in this link. Please scan the correct QR code.');
        return;
    }

    let data = null;

    if (id) {
        // Fetch from Firebase
        initFirebase();
        if (!db) {
            showCardError('Database not configured. Cannot load profile.');
            return;
        }

        try {
            const snapshot = await db.ref(`customers/${id}`).once('value');
            data = snapshot.val();
        } catch (e) {
            console.error("Firebase fetch error", e);
        }
    } else if (hash) {
        // Legacy fallback for old URL hashes
        data = decodeData(hash);
    }

    if (!data) {
        showCardError('This link appears to be invalid or corrupted. Profile not found.');
        return;
    }

    if (data.isActive === false) {
        showCardError('This profile is temporarily unavailable.');
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
    document.getElementById('card-content').style.display = 'block';

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

    document.getElementById('profile-name').textContent = data.name || 'Name';
    document.getElementById('profile-company').textContent = data.company
        ? (data.title ? `${data.title} @ ${data.company}` : data.company)
        : (data.title || '');

    // Quick action links
    setLink('qbtn-call', `tel:${data.phone}`, data.phone);
    setLink('qbtn-email', `mailto:${data.email}`, data.email);
    setLink('qbtn-wa', `https://wa.me/${(data.whatsapp || data.phone || '').replace(/\D/g, '')}`, data.whatsapp || data.phone);
    setLink('qbtn-location', data.location, data.location);

    if (data.linkedin) {
        const liBtn = document.getElementById('qbtn-linkedin');
        if (liBtn) { liBtn.href = data.linkedin; liBtn.style.display = 'flex'; }
    }

    // Detail rows
    setDetailRow('det-phone', data.phone, `tel:${data.phone}`);
    setDetailRow('det-email', data.email, `mailto:${data.email}`);
    setDetailRow('det-website', data.website && data.website.replace(/^https?:\/\//, ''), data.website);
    setDetailRow('det-location', data.location && 'View on Map', data.location);
    setDetailRow('det-linkedin', data.linkedin && prettyLink(data.linkedin), data.linkedin);
    setDetailRow('det-wa', data.whatsapp, `https://wa.me/${(data.whatsapp || '').replace(/\D/g, '')}`);
    setDetailRow('det-gpay', data.gpay, `tel:${data.gpay}`);

    // Render dynamic fields
    const dynContainer = document.getElementById('dynamic-details-container');
    if (dynContainer) {
        dynContainer.innerHTML = '';
        if (data.customFields && Array.isArray(data.customFields)) {
            data.customFields.forEach(f => {
                if (!f.label || !f.link) return;
                const row = document.createElement('a');
                row.className = 'detail-item';
                row.href = f.link;
                row.target = '_blank';
                row.rel = 'noopener';
                row.innerHTML = `
                    <div class="detail-icon link"><i class="fa-solid fa-link"></i></div>
                    <div class="detail-content">
                        <div class="detail-label">${f.label}</div>
                        <div class="detail-value">${prettyLink(f.link)}</div>
                    </div>
                    <i class="fa-solid fa-arrow-up-right-from-square detail-arrow"></i>
                `;
                dynContainer.appendChild(row);
            });
        }
    }
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
    document.getElementById('loading-state').style.display = 'none';
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

    const form = document.getElementById('login-form');
    const errMsg = document.getElementById('error-msg');

    form?.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const pass = document.getElementById('login-password').value;

        if (login(email, pass)) {
            window.location.href = 'admin.html';
        } else {
            errMsg.classList.add('show');
            form.classList.add('shake');
            setTimeout(() => form.classList.remove('shake'), 500);
        }
    });

    // Hide error on input
    document.getElementById('login-email')?.addEventListener('input', () => errMsg.classList.remove('show'));
    document.getElementById('login-password')?.addEventListener('input', () => errMsg.classList.remove('show'));
}

// =====================================================
//  Auto-Initialize based on page
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.page;
    if (page === 'login') initLogin();
    if (page === 'admin') initAdmin();
    if (page === 'card') initCard();
});
