// ============= AUTHENTICATION & CLOUD STORAGE =============

// OAuth Configuration
const GOOGLE_CLIENT_ID = '1076553063267-h3pfdmhtpl4rp16ftdsbbiaq76odsqka.apps.googleusercontent.com';
const MICROSOFT_CLIENT_ID = 'c44b4083-3bb0-49c1-b47d-974e53cbdf3c';

// Cloud Storage State
let currentUser = null;
let authProvider = null; // 'google' or 'microsoft'
let accessToken = null;
let googleTokenClient = null;

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

    // Usar solo OAuth2 Token Client para obtener tanto info del usuario como acceso a Drive
    googleTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
        callback: async (tokenResponse) => {
            if (tokenResponse.error) {
                console.error('Error en autenticación:', tokenResponse);
                alert('Error al iniciar sesión con Google');
                return;
            }

            // Guardar el access token
            accessToken = tokenResponse.access_token;
            console.log('✅ Token de acceso obtenido:', accessToken ? 'SÍ' : 'NO');

            // Obtener información del usuario con el token
            try {
                const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                });

                if (userInfoResponse.ok) {
                    const userInfo = await userInfoResponse.json();

                    currentUser = {
                        name: userInfo.name,
                        email: userInfo.email,
                        picture: userInfo.picture,
                        isGuest: false
                    };

                    authProvider = 'google';

                    saveSession();
                    closeLoginModal();
                    hideLandingPage();
                    showMainApp();
                    updateUserUI();

                    console.log('✅ Login exitoso con Google:', currentUser);
                    showNotification('✅ Sesión iniciada con Google', 'success');
                } else {
                    const errorText = await userInfoResponse.text();
                    console.error('Error obteniendo info del usuario:', errorText);
                    throw new Error('No se pudo obtener información del usuario');
                }
            } catch (error) {
                console.error('Error obteniendo información del usuario:', error);
                alert('Error al obtener información del usuario. Verifica la consola para más detalles.');
            }
        },
    });

    // Solicitar el token (esto abrirá el popup de Google)
    googleTokenClient.requestAccessToken({ prompt: 'consent' });
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
            authority: 'https://login.microsoftonline.com/consumers',
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

        console.log('✅ Login exitoso con Microsoft:', currentUser);
        showNotification('✅ Sesión iniciada con Microsoft', 'success');
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

async function getOrCreateGoogleFolder(folderName, parentId = null) {
    let query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentId) {
        query += ` and '${parentId}' in parents`;
    }

    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const result = await response.json();

    if (result.files && result.files.length > 0) {
        return result.files[0].id;
    }

    // Create folder
    const metadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
    };
    if (parentId) {
        metadata.parents = [parentId];
    }

    const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata)
    });
    const createResult = await createResponse.json();
    return createResult.id;
}

async function saveToGoogleDrive(pdfBlob, filename, year) {
    console.log('🔵 Intentando guardar en Google Drive...');

    if (!accessToken) {
        showNotification('❌ No hay token de acceso. Vuelve a iniciar sesión.', 'error');
        return false;
    }

    try {
        // 1. Obtener o crear carpeta principal "Parte Mensuales"
        const mainFolderId = await getOrCreateGoogleFolder('Parte Mensuales');

        // 2. Obtener o crear subcarpeta del año
        const yearFolderId = await getOrCreateGoogleFolder(year.toString(), mainFolderId);

        const metadata = {
            name: filename,
            mimeType: 'application/pdf',
            parents: [yearFolderId]
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', pdfBlob);

        console.log('📤 Subiendo archivo a Google Drive...');
        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            },
            body: form
        });

        if (response.ok) {
            const result = await response.json();
            showNotification(`✅ PDF guardado en Google Drive (${year}/Parte Mensuales)`, 'success');
            return true;
        } else {
            const errorText = await response.text();
            throw new Error(`Error ${response.status}: ${errorText}`);
        }
    } catch (error) {
        console.error('❌ Error guardando en Google Drive:', error);
        showNotification(`❌ Error: ${error.message}`, 'error');
        return false;
    }
}

async function saveToOneDrive(pdfBlob, filename, year) {
    console.log('🔵 Intentando guardar en OneDrive...');

    if (!accessToken) {
        showNotification('❌ No hay token de acceso. Vuelve a iniciar sesión.', 'error');
        return false;
    }

    try {
        console.log('📤 Subiendo archivo a OneDrive...');
        // Microsoft Graph permite crear carpetas automáticamente usando la ruta en la URL
        const encodedFilename = encodeURIComponent(filename);
        const encodedPath = encodeURIComponent(`Parte Mensuales/${year}`);

        const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/Parte Mensuales/${year}/${encodedFilename}:/content`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/pdf'
            },
            body: pdfBlob
        });

        if (response.ok) {
            showNotification(`✅ PDF guardado en OneDrive (${year}/Parte Mensuales)`, 'success');
            return true;
        } else {
            const errorText = await response.text();
            throw new Error(`Error ${response.status}: ${errorText}`);
        }
    } catch (error) {
        console.error('❌ Error guardando en OneDrive:', error);
        showNotification(`❌ Error: ${error.message}`, 'error');
        return false;
    }
}

// ============= SESSION MANAGEMENT =============
function saveSession() {
    const session = {
        user: currentUser,
        provider: authProvider,
        token: accessToken, // Guardar token para restaurar sesión
        timestamp: Date.now()
    };
    localStorage.setItem('userSession', JSON.stringify(session));
    console.log('💾 Sesión guardada');
}

function loadSavedSession() {
    try {
        const saved = localStorage.getItem('userSession');
        if (saved) {
            const session = JSON.parse(saved);

            // Verificar si la sesión no ha expirado (1 hora para tokens)
            const hourInMs = 60 * 60 * 1000;
            if (Date.now() - session.timestamp < hourInMs) {
                currentUser = session.user;
                authProvider = session.provider;
                accessToken = session.token;

                hideLandingPage();
                showMainApp();
                updateUserUI();

                console.log('✅ Sesión restaurada:', currentUser);
                console.log('Token restaurado:', accessToken ? 'SÍ' : 'NO');
            } else {
                console.log('⏰ Sesión expirada');
                localStorage.removeItem('userSession');
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

        console.log('👋 Sesión cerrada');
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
        max-width: 300px;
        word-wrap: break-word;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 5000); // 5 segundos para leer el mensaje
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
    accessToken: () => accessToken, // Exportar también el token para debug
    saveToGoogleDrive,
    saveToOneDrive,
    showNotification
};
