/**
 * Restaurant QR Menu Platform Logic
 */

const REST_CREDENTIALS = { email: 'menu@restaurant.com', password: 'admin123' };
const REST_SESSION_KEY = 'rmq_session';

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

// Session / Auth
function isLoggedIn() {
    return sessionStorage.getItem(REST_SESSION_KEY) === 'true';
}

function login(email, password) {
    if (email === REST_CREDENTIALS.email && password === REST_CREDENTIALS.password) {
        sessionStorage.setItem(REST_SESSION_KEY, 'true');
        return true;
    }
    return false;
}

function logout() {
    sessionStorage.removeItem(REST_SESSION_KEY);
    window.location.href = 'restaurant-login.html';
}

function requireAuth() {
    if (!isLoggedIn()) {
        window.location.href = 'restaurant-login.html';
    }
}

// Data Persistence
async function loadMenus() {
    if (!db) return [];
    try {
        const snapshot = await db.ref('menus').once('value');
        const data = snapshot.val();
        if (!data) return [];
        return Object.values(data);
    } catch (e) {
        console.error("Failed to load menus:", e);
        showToast('Error loading from Firebase', 'error');
        return [];
    }
}

async function saveMenus(list) {
    if (!db) return;
    try {
        const updates = {};
        list.forEach(m => { updates[m.id] = m; });
        await db.ref('menus').set(updates);
    } catch (e) {
        console.error("Failed to save to Firebase:", e);
        throw e;
    }
}

function buildMenuURL(data) {
    const base = window.location.href.replace(/\/[^\/]*$/, '/');
    return `${base}restaurant.html?id=${data.id}`;
}

// Toast
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

// QR
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

function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
}

// ADMIN LOGIC
let menus = [];
let editingId = null;
let shareUrl = '';

async function initAdmin() {
    requireAuth();
    initFirebase();

    if (db) {
        menus = await loadMenus();
        renderMenusGrid();
    } else {
        showToast("Database connection failed.", "error");
    }

    bindAdminEvents();
}

function renderMenusGrid() {
    const grid = document.getElementById('menu-grid');
    const countEl = document.getElementById('menu-count');
    if (!grid) return;

    if (countEl) countEl.textContent = menus.length;

    if (menus.length === 0) {
        grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
            <div class="empty-icon">🍽️</div>
            <h3>No Menus Yet</h3>
            <p>Click <strong>+ Add Menu</strong> to create your first restaurant menu QR.</p>
        </div>`;
        return;
    }

    grid.innerHTML = menus.map((m, i) => `
    <div class="customer-card fade-in" style="animation-delay:${i * 0.06}s; ${m.isActive === false ? 'opacity:0.6;' : ''}">
        <img class="customer-avatar" src="${m.logo || 'https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(m.name)}" alt="${m.name}">
        <div class="customer-info" style="display:flex; flex-direction:column; align-items:flex-start;">
            <h4>${m.name}</h4>
            <p>Menu Active</p>
            ${m.isActive === false ? '<span style="font-size:0.65rem; background:rgba(255,79,107,0.15); color:var(--danger); padding:2px 8px; border-radius:12px; margin-top:6px; border:1px solid rgba(255,79,107,0.3);">Inactive</span>' : ''}
        </div>
        <div class="customer-actions">
            <button class="btn btn-secondary btn-icon" onclick="openShareModal('${m.id}')" title="Share / QR">
                <i class="fa-solid fa-qrcode"></i>
            </button>
            <button class="btn btn-secondary btn-icon" onclick="openEditModal('${m.id}')" title="Edit">
                <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="btn btn-danger btn-icon" onclick="confirmDelete('${m.id}')" title="Delete">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    </div>`).join('');
}

function openAddModal() {
    editingId = null;
    document.getElementById('modal-title').textContent = 'Add Menu';
    document.getElementById('menu-form').reset();
    document.getElementById('f-isactive').checked = true;
    resetPreview('logo-preview', 'logo-placeholder');
    tempMenuData = [];
    renderBuilder();
    openModal('menu-modal');
}

function openEditModal(id) {
    const m = menus.find(x => x.id === id);
    if (!m) return;
    editingId = id;

    document.getElementById('modal-title').textContent = 'Edit Menu';
    document.getElementById('f-name').value = m.name || '';
    document.getElementById('f-isactive').checked = m.isActive !== false;

    if (m.logo) setPreview('logo-preview', 'logo-placeholder', m.logo);
    else resetPreview('logo-preview', 'logo-placeholder');

    tempMenuData = m.menuData ? JSON.parse(JSON.stringify(m.menuData)) : [];
    renderBuilder();

    openModal('menu-modal');
}

async function handleMenuSubmit(e) {
    e.preventDefault();
    if (!db) { showToast('Firebase not connected!', 'error'); return; }

    const nameVal = document.getElementById('f-name').value.trim();
    if (!nameVal) {
        showToast('Restaurant Name is required.', 'error');
        return;
    }

    // Basic Validation for Text Menu
    let hasItems = false;
    for (let cat of tempMenuData) {
        if (cat.items.length > 0 && cat.items[0].name.trim() !== '') hasItems = true;
    }

    const btn = document.querySelector('#menu-form button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    try {
        const logoEl = document.getElementById('logo-preview');
        const logo = (logoEl.style.display !== 'none' && logoEl.src) ? logoEl.src : '';

        if (!hasItems) {
            showToast('Please add at least one valid menu item!', 'error');
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }

        const menuDataObj = {
            id: editingId || `m_${Date.now().toString(36)}`,
            name: nameVal,
            logo,
            menuData: tempMenuData,
            isActive: document.getElementById('f-isactive').checked,
            createdAt: editingId ? (menus.find(m => m.id === editingId)?.createdAt || Date.now()) : Date.now()
        };

        if (editingId) {
            const idx = menus.findIndex(x => x.id === editingId);
            if (idx > -1) menus[idx] = menuDataObj;
        } else {
            menus.push(menuDataObj);
        }

        await saveMenus(menus);
        showToast(editingId ? 'Menu updated!' : 'Menu created!', 'success');

        closeModal('menu-modal');
        renderMenusGrid();
    } catch (e) {
        showToast('Error saving menu', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function confirmDelete(id) {
    const m = menus.find(x => x.id === id);
    if (!m) return;

    document.getElementById('delete-menu-name').textContent = m.name;
    document.getElementById('confirm-delete-btn').onclick = async () => {
        if (!db) return;

        const btn = document.getElementById('confirm-delete-btn');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        menus = menus.filter(x => x.id !== id);
        await db.ref(`menus/${id}`).remove();

        closeModal('delete-modal');
        renderMenusGrid();
        showToast('Menu deleted.', 'info');
        btn.innerHTML = 'Yes, Delete';
    };
    openModal('delete-modal');
}

function openShareModal(id) {
    const m = menus.find(x => x.id === id);
    if (!m) return;

    shareUrl = buildMenuURL(m);
    document.getElementById('share-link-input').value = shareUrl;
    document.getElementById('share-menu-name').textContent = m.name;

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
        link.download = 'restaurant_qr.png';
    } else if (img) {
        link.href = img.src;
        link.download = 'restaurant_qr.png';
    }

    link.click();
    showToast('QR Code downloaded!', 'success');
}

function handlePhotoUpload(e, previewId, placeholderId) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        setPreview(previewId, placeholderId, ev.target.result);
    };
    reader.readAsDataURL(file);
}

function setPreview(previewId, placeholderId, srcUrl) {
    const preview = document.getElementById(previewId);
    preview.src = srcUrl;
    preview.style.display = 'block';

    // Check if image data is valid
    if (srcUrl.startsWith('data:image') || srcUrl.startsWith('http')) {
        document.getElementById(placeholderId).style.display = 'none';
    } else {
        resetPreview(previewId, placeholderId);
    }
}

function resetPreview(previewId, placeholderId) {
    const preview = document.getElementById(previewId);
    preview.src = '';
    preview.style.display = 'none';
    document.getElementById(placeholderId).style.display = 'flex';
}

/* --- Menu Builder Logic --- */
let tempMenuData = [];

function renderBuilder() {
    const container = document.getElementById('menu-builder-container');
    if (!container) return;

    container.innerHTML = tempMenuData.map((cat, cIdx) => `
        <div class="mb-category">
            <div class="mb-cat-header">
                <input type="text" class="form-control" placeholder="Category Name (e.g. Starters)" value="${cat.name}" onchange="updateCatName(${cIdx}, this.value)">
                <button type="button" class="mb-remove-btn" onclick="removeCategory(${cIdx})" title="Remove Category">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
            
            <div class="mb-items">
                ${cat.items.map((item, iIdx) => `
                    <div class="mb-item">
                        <div class="mb-item-grid">
                            <input type="text" class="form-control" placeholder="Item Name" value="${item.name}" onchange="updateItemName(${cIdx}, ${iIdx}, this.value)" style="padding:8px 12px; font-size:0.85rem;">
                            <input type="text" class="form-control" placeholder="Price (e.g. $12)" value="${item.price}" onchange="updateItemPrice(${cIdx}, ${iIdx}, this.value)" style="padding:8px 12px; font-size:0.85rem;">
                        </div>
                        <div style="display:flex; gap:12px;">
                            <input type="text" class="form-control" placeholder="Description (optional)" value="${item.desc}" onchange="updateItemDesc(${cIdx}, ${iIdx}, this.value)" style="padding:8px 12px; font-size:0.8rem; color:var(--text-muted); flex:1;">
                            <button type="button" class="mb-remove-btn" onclick="removeItem(${cIdx}, ${iIdx})" title="Remove Item" style="height:35px; width:35px; padding:0;">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <button type="button" class="btn btn-secondary" style="padding:6px 12px; font-size:0.75rem; margin-top:8px;" onclick="addItem(${cIdx})">
                <i class="fa-solid fa-plus"></i> Add Item
            </button>
        </div>
    `).join('');

    if (tempMenuData.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:0.85rem; border:1px dashed var(--border); border-radius:var(--radius-md);">No categories yet. Click "Add Category" to start building your menu.</div>`;
    }
}

window.addCategory = function () {
    tempMenuData.push({ name: '', items: [{ name: '', price: '', desc: '' }] });
    renderBuilder();
};

window.removeCategory = function (cIdx) {
    tempMenuData.splice(cIdx, 1);
    renderBuilder();
};

window.updateCatName = function (cIdx, val) { tempMenuData[cIdx].name = val; };

window.addItem = function (cIdx) {
    tempMenuData[cIdx].items.push({ name: '', price: '', desc: '' });
    renderBuilder();
};

window.removeItem = function (cIdx, iIdx) {
    tempMenuData[cIdx].items.splice(iIdx, 1);
    renderBuilder();
};

window.updateItemName = function (cIdx, iIdx, val) { tempMenuData[cIdx].items[iIdx].name = val; };
window.updateItemPrice = function (cIdx, iIdx, val) { tempMenuData[cIdx].items[iIdx].price = val; };
window.updateItemDesc = function (cIdx, iIdx, val) { tempMenuData[cIdx].items[iIdx].desc = val; };


function bindAdminEvents() {
    document.getElementById('btn-add-menu')?.addEventListener('click', openAddModal);
    document.getElementById('btn-logout')?.addEventListener('click', logout);
    document.getElementById('menu-form')?.addEventListener('submit', handleMenuSubmit);

    document.getElementById('f-logo')?.addEventListener('change', (e) => handlePhotoUpload(e, 'logo-preview', 'logo-placeholder'));

    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
    });

    document.getElementById('btn-copy-link')?.addEventListener('click', copyShareLink);
    document.getElementById('btn-download-qr')?.addEventListener('click', downloadQR);

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('active');
        });
    });
}

// LOGIN PAGE
function initLogin() {
    if (isLoggedIn()) {
        window.location.href = 'restaurant-admin.html';
        return;
    }

    const form = document.getElementById('login-form');
    const errMsg = document.getElementById('error-msg');

    form?.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const pass = document.getElementById('login-password').value;

        if (login(email, pass)) {
            window.location.href = 'restaurant-admin.html';
        } else {
            errMsg.classList.add('show');
            form.classList.add('shake');
            setTimeout(() => form.classList.remove('shake'), 500);
        }
    });

    document.getElementById('login-email')?.addEventListener('input', () => errMsg.classList.remove('show'));
    document.getElementById('login-password')?.addEventListener('input', () => errMsg.classList.remove('show'));
}

// MENU DISPLAY PAGE
async function initMenu() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    if (!id) {
        showMenuError('No menu data found in this link. Please scan the correct QR code.');
        return;
    }

    initFirebase();
    if (!db) {
        showMenuError('Database not configured. Cannot load menu.');
        return;
    }

    try {
        const snapshot = await db.ref(`menus/${id}`).once('value');
        const data = snapshot.val();

        if (!data) {
            showMenuError('This menu link appears to be invalid or deleted.');
            return;
        }

        if (data.isActive === false) {
            showMenuError('This menu is temporarily unavailable.');
            return;
        }

        renderMenuViewer(data);
    } catch (e) {
        console.error("Firebase fetch error", e);
        showMenuError('Failed to fetch the menu.');
    }
}

function renderMenuViewer(data) {
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('menu-content').style.display = 'block';

    document.title = `${data.name} | Digital Menu`;

    document.getElementById('restaurant-title').textContent = data.name;

    const logo = document.getElementById('restaurant-logo');
    const splashImg = document.getElementById('splash-img');
    const splashIcon = document.getElementById('splash-icon');

    if (data.logo) {
        logo.src = data.logo;
        splashImg.src = data.logo;
        splashImg.style.display = 'block';
        splashIcon.style.display = 'none';
    } else {
        logo.style.display = 'none';
        document.getElementById('restaurant-icon-fallback').style.display = 'flex';
        // Splash defaults to the utensils icon
    }

    const container = document.getElementById('menu-text-container');
    if (data.menuData && Array.isArray(data.menuData) && data.menuData.length > 0) {
        container.innerHTML = data.menuData.map(cat => `
            <div class="menu-category-block">
                <h2 class="menu-category-title">${cat.name}</h2>
                ${cat.items.map(item => `
                    <div class="menu-item-row">
                        <div class="menu-item-top">
                            <span class="menu-item-name">${item.name}</span>
                            <div class="menu-item-leader"></div>
                            <span class="menu-item-price">${item.price}</span>
                        </div>
                        ${item.desc ? `<div class="menu-item-desc">${item.desc}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `).join('');
    } else {
        container.innerHTML = `
            <div style="text-align:center; padding:60px 20px; color:var(--text-muted);">
                <i class="fa-solid fa-note-sticky" style="font-size:3rem; opacity:0.3; margin-bottom:16px;"></i>
                <p>This menu has not been built yet.</p>
            </div>
        `;
    }

    // Fade out splash screen after minimum delay
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        if (splash) splash.classList.add('hide');
    }, 1200);
}

function showMenuError(msg) {
    const loading = document.getElementById('loading-state');
    if (loading) loading.style.display = 'none';

    const err = document.getElementById('error-state');
    if (err) {
        err.style.display = 'flex';
        const p = err.querySelector('p');
        if (p) p.textContent = msg;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.page;
    if (page === 'restaurant-login') initLogin();
    if (page === 'restaurant-admin') initAdmin();
    if (page === 'restaurant-menu') initMenu();
});
