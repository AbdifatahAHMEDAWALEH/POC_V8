const API_URL = "http://127.0.0.1:8000";
let lastAnalyzedFile = "";
let lastAnalyzedJobDesc = "";
let selectedCvId = null;

// --- GESTION BIBLIOTHÈQUE ---
function useSavedCv(cvId, filename) {
    selectedCvId = cvId;
    
    const infoZone = document.getElementById('selected-cv-info');
    infoZone.style.display = 'block';
    // Ajout d'une petite animation de flash pour attirer l'oeil
    infoZone.style.animation = "highlight 1s ease"; 
    
    document.getElementById('selected-cv-name').innerText = "📍 Prêt pour analyse : " + filename;
    document.getElementById('file-input-container').style.display = 'none';

    // Scroll fluide vers le formulaire pour mobile/petits écrans
    document.querySelector('.AnalyzeSection').scrollIntoView({ behavior: 'smooth' });

    validateForm();
}

function clearSelectedCv() {
    selectedCvId = null;
    document.getElementById('selected-cv-info').style.display = 'none';
    document.getElementById('file-input-container').style.display = 'block';
    validateForm();
}

// --- FONCTION DE VALIDATION ---
function validateForm() {
    const cvFileInput = document.getElementById('cvFile');
    const jobOfferDescriptionInput = document.getElementById('jobOfferDescription');
    const btn = document.getElementById('uploadBtn');

    if (!btn) return;

    const hasFile = cvFileInput && cvFileInput.files.length > 0;
    const hasSelectedCv = selectedCvId !== null;
    const hasJobDesc = jobOfferDescriptionInput && jobOfferDescriptionInput.value.trim().length > 0;

    // Le bouton est actif si (Fichier OU CV en base) ET Description
    btn.disabled = !((hasFile || hasSelectedCv) && hasJobDesc);
    btn.style.opacity = btn.disabled ? 0.5 : 1;
    btn.style.cursor = btn.disabled ? 'not-allowed' : 'pointer';
}

// --- INSCRIPTION ---
async function register(event, route) {
    event.preventDefault();
    const form = event.target;
    const data = new FormData(form);
    const values = Object.fromEntries(data.entries());
    const responseZone = document.getElementById('zone_response');

    try {
        const response = await fetch(`${API_URL}${route}`, {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify(values)
        });

        const result = await response.json();
        if (response.ok) {
            responseZone.textContent = result.message || "Inscription réussie !";
            responseZone.style.color = "green";
        } else {
            throw new Error(result.detail || 'Erreur d\'inscription');
        }
    } catch (error) {
        if(responseZone){
            responseZone.textContent = "Erreur : " + error.message;
            responseZone.style.color = "red";
        }
    }
}

// --- CONNEXION ---
async function login(event, route) {
    event.preventDefault();
    const form = event.target;
    const data = new FormData(form);
    const values = Object.fromEntries(data.entries());
    const responseZone = document.getElementById('zone_response');

    try {
        const response = await fetch(`${API_URL}${route}`, {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify(values)
        });

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('token', data.access_token);
            localStorage.setItem('username', values.username);
            window.location.href = 'home_page.html';
        } else {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Erreur de connexion');
        }
    } catch (error) {
        if(responseZone){
            responseZone.textContent = "Erreur : " + error.message;
            responseZone.style.color = "red";
        }
    }
}



// --- GESTION ANALYSE ---
const uploadForm = document.getElementById('UploadForm');
if (uploadForm) {
    uploadForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const cvFileInput = document.getElementById('cvFile');
        const jobDesc = document.getElementById('jobOfferDescription').value.trim();
        const btn = document.getElementById('uploadBtn');
        const token = localStorage.getItem('token');
        const saveCheck = document.getElementById('saveCvCheck').checked;
        
        btn.disabled = true;
        document.getElementById('loader').style.display = 'block';
    try {
            // SAUVEGARDE (Si cochée ET qu'il y a un fichier physique)
            if (saveCheck && cvFileInput.files.length > 0) {
                const saveFormData = new FormData();
                saveFormData.append('cv', cvFileInput.files[0]);
                
                const saveResponse = await fetch(`${API_URL}/save-cv`, { // On nomme différemment pour éviter les conflits
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: saveFormData
                });

                if (saveResponse.ok) {
                    console.log("CV sauvegardé avec succès !");
                    await loadMyCvs(); // On attend que la liste soit rechargée
                } else {
                    console.error("Erreur lors de la sauvegarde du CV.");
                }
            }
        } catch (e) {
            console.error("Erreur lors de la sauvegarde du CV:", e);
        }
        try {


            const analysisformData = new FormData();
            analysisformData.append('job_offer_description', jobDesc);

            if (selectedCvId) {
                analysisformData.append('cv_id', selectedCvId);
                console.log("Analyse avec CV ID:", selectedCvId);
            } else if (cvFileInput.files.length > 0) {
                analysisformData.append('cv', cvFileInput.files[0]);
            }

            const response = await fetch(`${API_URL}/analyze`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: analysisformData
            });

            if (response.ok) {
                const result = await response.json();
                displayAnalysis(result.ATS_score, result.analysis_details, result.ats_advice);
            }
        } finally {
            document.getElementById('loader').style.display = 'none';
            btn.disabled = false;
            validateForm();
        }
    });
}


// --- CHARGEMENT BIBLIOTHÈQUE ---
async function loadMyCvs() {
    const token = localStorage.getItem('token');
    const cvsList = document.getElementById('cvs-list'); 
    const libraryDiv = document.getElementById('cv-library');

    if (!token || !cvsList || !libraryDiv) return;

    try {
        const response = await fetch(`${API_URL}/my-cvs`, {
            method: 'GET',
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.cvs && data.cvs.length > 0) {
                libraryDiv.style.display = 'block'; 
                cvsList.innerHTML = data.cvs.map(cv => `
                <li style="padding: 12px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s;">
                <span style="font-weight: 500; color: #444;">📄 ${cv.filename}</span>
                <button onclick="useSavedCv(${cv.id}, '${cv.filename.replace(/'/g, "\\'")}')" 
                class="button" 
                style="width: auto; padding: 6px 15px; font-size: 13px; margin: 0; background-color: #1a497a; border-radius: 6px;">
                Utiliser ce CV
                </button>
                </li>`).join('');
            } else {
                libraryDiv.style.display = 'none';
            }
        }
    } catch (e) {
        console.error("Erreur bibliothèque:", e);
    }
}

async function checkAuth() {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    
    if (!token) {
        if (!window.location.href.includes('index.html') && !window.location.href.includes('registration')) {
            window.location.href = 'index.html';
        }
        return;
    }

    const userDisplay = document.getElementById('user-display');
    if (userDisplay && username) {
        userDisplay.textContent = username;
    }

    if (document.getElementById('cvs-list')) {
        loadMyCvs();
    }
}

function logout() {
    localStorage.clear();
    window.location.href = 'index.html';
}

// --- ÉCOUTEURS ---
const cvInput = document.getElementById('cvFile');
if (cvInput) cvInput.addEventListener('change', validateForm);

const jobInput = document.getElementById('jobOfferDescription');
if (jobInput) jobInput.addEventListener('input', validateForm);

const loginF = document.getElementById('loginForm');
if (loginF) loginF.addEventListener('submit', (e) => login(e, '/login'));

const regF = document.getElementById('registrationForm');
if (regF) regF.addEventListener('submit', (e) => register(e, '/register'));

// Initialisation
validateForm();
checkAuth();