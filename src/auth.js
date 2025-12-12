// ============= AUTHENTICATION & CLOUD STORAGE =============

// OAuth Configuration
const GOOGLE_CLIENT_ID = 'TU_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
const MICROSOFT_CLIENT_ID = 'TU_MICROSOFT_CLIENT_ID';

// Cloud Storage State
let currentUser = null;
let authProvider = null; // 'google' or 'microsoft'
let accessToken = null;

// ============= INITIALIZATION =============
document.addEventListener('DOMContentLoaded', () => {
    initializeLandingPage();
    loadSavedSession();
});

function initializeLandingPage() {
    // Landing page buttons
    document.getElementById('guest-access-btn').addEventListener('click', () => {
        enterAsGuest();
    });

    document.getElementById('account-access-btn').addEventListener('click', () => {
        openLoginModal();
    });

    // Login modal
    document.getElementById('close-login-modal').addEventListener('click', closeLoginModal);
    document.getElementById('google-login-btn').addEventListener('click', loginWithGoogle);
    document.getElementById('microsoft-login-btn').addEventListener('click', loginWithMicrosoft);

    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
}

// ============= GUEST ACCESS =============
function enterAsGuest() {
    console.log('Entrando como visitante');
    hideLandingPage();
    showMainApp();
    currentUser = {
        name: 'Visitante',
        email: null,
        picture: null,
        isGuest: true
    };
    updateUserUI();
}

// ============= LOGIN MODAL =============
function openLoginModal() {
    document.getElementById('login-modal').classList.add('show');
}

function closeLoginModal() {
    document.getElementById('login-modal').classList.remove('show');
}

// ============= GOOGLE OAUTH =============
function loginWithGoogle() {
    console.log('Iniciando login con Google...');

    // Verificar si el cliente de Google está cargado
    if (typeof google === 'undefined') {
        alert('Error: La biblioteca de Google no se ha cargado. Por favor, recarga la página.');
        return;
    }

    // Inicializar Google Identity Services
    google.accounts.id.initialize({
        client_id: '1076553063267-h3pfdmhtpl4rp16ftdsbbiaq76odsqka.apps.googleusercontent.com',
        callback: handleGoogleCallback,
        auto_select: false
    });

    // Mostrar el prompt de login
    google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            // Fallback: usar el botón de login
            google.accounts.id.renderButton(
                document.getElementById('google-login-btn'),
                { theme: 'outline', size: 'large', text: 'continue_with' }
            );
        }
    });

    // Solicitar token de acceso para Google Drive
    const client = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile',
        callback: (tokenResponse) => {
            accessToken = tokenResponse.access_token;
            console.log('Token de acceso obtenido para Google Drive');
        },
    });

    client.requestAccessToken();
}

function handleGoogleCallback(response) {
    // Decodificar el JWT token
    const payload = parseJwt(response.credential);

    currentUser = {
        name: payload.name,
        email: payload.email,
        picture: payload.picture,
        isGuest: false
    };

    authProvider = 'google';

    saveSession();
    closeLoginModal();
    hideLandingPage();
    showMainApp();
    updateUserUI();

    console.log('Login exitoso con Google:', currentUser);
}

// ============= MICROSOFT OAUTH =============
async function loginWithMicrosoft() {
    console.log('Iniciando login con Microsoft...');

    // Verificar si MSAL está cargado
    if (typeof msal === 'undefined') {
        alert('Error: La biblioteca de Microsoft no se ha cargado. Por favor, recarga la página.');
        return;
    }

    const msalConfig = {
        auth: {
            clientId: MICROSOFT_CLIENT_ID,
            authority: 'https://login.microsoftonline.com/common',
            redirectUri: window.location.origin
        },
        cache: {
            cacheLocation: 'localStorage',
            storeAuthStateInCookie: false
        }
    };

    const msalInstance = new msal.PublicClientApplication(msalConfig);

    const loginRequest = {
        scopes: ['User.Read', 'Files.ReadWrite']
    };

    try {
        const loginResponse = await msalInstance.loginPopup(loginRequest);

        currentUser = {
            name: loginResponse.account.name,
            email: loginResponse.account.username,
            picture: null, // Microsoft no proporciona foto en el token
            isGuest: false
        };

        authProvider = 'microsoft';
        accessToken = loginResponse.accessToken;

        // Obtener foto de perfil
        getMicrosoftProfilePhoto(loginResponse.accessToken);

        saveSession();
        closeLoginModal();
        hideLandingPage();
        showMainApp();
        updateUserUI();

        console.log('Login exitoso con Microsoft:', currentUser);
    } catch (error) {
        console.error('Error en login de Microsoft:', error);
        alert('Error al iniciar sesión con Microsoft. Por favor, intenta de nuevo.');
    }
}

async function getMicrosoftProfilePhoto(token) {
    try {
        const response = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const blob = await response.blob();
            currentUser.picture = URL.createObjectURL(blob);
            updateUserUI();
        }
    } catch (error) {
        console.log('No se pudo obtener la foto de perfil de Microsoft');
    }
}

// ============= CLOUD STORAGE =============
async function saveToGoogleDrive(pdfBlob, filename) {
    if (!accessToken) {
        console.error('No hay token de acceso para Google Drive');
        return false;
    }

    const metadata = {
        name: filename,
        mimeType: 'application/pdf'
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', pdfBlob);

    try {
        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            },
            body: form
        });

        if (response.ok) {
            const result = await response.json();
            console.log('PDF guardado en Google Drive:', result);
            showNotification('✅ PDF guardado en Google Drive', 'success');
            return true;
        } else {
            throw new Error('Error al subir a Google Drive');
        }
    } catch (error) {
        console.error('Error guardando en Google Drive:', error);
        showNotification('❌ Error al guardar en Google Drive', 'error');
        return false;
    }
}

async function saveToOneDrive(pdfBlob, filename) {
    if (!accessToken) {
        console.error('No hay token de acceso para OneDrive');
        return false;
    }

    try {
        const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${filename}:/content`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/pdf'
            },
            body: pdfBlob
        });

        if (response.ok) {
            const result = await response.json();
            console.log('PDF guardado en OneDrive:', result);
            showNotification('✅ PDF guardado en OneDrive', 'success');
            return true;
        } else {
            throw new Error('Error al subir a OneDrive');
        }
    } catch (error) {
        console.error('Error guardando en OneDrive:', error);
        showNotification('❌ Error al guardar en OneDrive', 'error');
        return false;
    }
}

// ============= SESSION MANAGEMENT =============
function saveSession() {
    const session = {
        user: currentUser,
        provider: authProvider,
        timestamp: Date.now()
    };
    localStorage.setItem('userSession', JSON.stringify(session));
}

function loadSavedSession() {
    try {
        const saved = localStorage.getItem('userSession');
        if (saved) {
            const session = JSON.parse(saved);

            // Verificar si la sesión no ha expirado (24 horas)
            const dayInMs = 24 * 60 * 60 * 1000;
            if (Date.now() - session.timestamp < dayInMs) {
                currentUser = session.user;
                authProvider = session.provider;

                hideLandingPage();
                showMainApp();
                updateUserUI();

                console.log('Sesión restaurada:', currentUser);
            }
        }
    } catch (error) {
        console.error('Error cargando sesión:', error);
    }
}

function logout() {
    if (confirm('¿Cerrar sesión?')) {
        currentUser = null;
        authProvider = null;
        accessToken = null;
        localStorage.removeItem('userSession');

        showLandingPage();
        hideMainApp();

        console.log('Sesión cerrada');
    }
}

// ============= UI UPDATES =============
function hideLandingPage() {
    document.getElementById('landing-page').style.display = 'none';
}

function showLandingPage() {
    document.getElementById('landing-page').style.display = 'flex';
}

function hideMainApp() {
    document.getElementById('main-app').style.display = 'none';
}

function showMainApp() {
    document.getElementById('main-app').style.display = 'block';
}

function updateUserUI() {
    const userInfo = document.getElementById('user-info');
    const userAvatar = document.getElementById('user-avatar');
    const userName = document.getElementById('user-name');
    const cloudSaveOption = document.getElementById('cloud-save-option');
    const cloudProviderHint = document.getElementById('cloud-provider-hint');

    if (currentUser && !currentUser.isGuest) {
        userInfo.style.display = 'flex';
        userName.textContent = currentUser.name;

        if (currentUser.picture) {
            userAvatar.src = currentUser.picture;
            userAvatar.style.display = 'block';
        } else {
            userAvatar.style.display = 'none';
        }

        // Mostrar opción de guardar en la nube
        if (cloudSaveOption) {
            cloudSaveOption.style.display = 'block';
            const providerName = authProvider === 'google' ? 'Google Drive' : 'OneDrive';
            cloudProviderHint.textContent = `Se guardará en tu ${providerName}`;
        }
    } else {
        userInfo.style.display = 'none';
        if (cloudSaveOption) {
            cloudSaveOption.style.display = 'none';
        }
    }
}

function showNotification(message, type = 'info') {
    // Crear notificación temporal
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        padding: 16px 24px;
        background: ${type === 'success' ? '#16A34A' : '#DC2626'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        animation: slideInRight 0.3s ease;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ============= UTILITIES =============
function parseJwt(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    return JSON.parse(jsonPayload);
}

// Exportar funciones para uso en main.js
window.authModule = {
    currentUser: () => currentUser,
    authProvider: () => authProvider,
    saveToGoogleDrive,
    saveToOneDrive,
    showNotification
};

