
const API_URL = "http://127.0.0.1:8000";
let lastAnalyzedFile = "";
let lastAnalyzedJobDesc = "";

// --- FONCTION DE VALIDATION ---
function validateForm() {
    const cvFileInput = document.getElementById('cvFile');
    const jobOfferDescriptionInput = document.getElementById('jobOfferDescription');
    const btn = document.getElementById('uploadBtn');

    // On sort discrètement si on n'est pas sur la bonne page
    if (!cvFileInput || !jobOfferDescriptionInput || !btn) return;

    const hasFile = cvFileInput.files.length > 0;
    const hasText = jobOfferDescriptionInput.value.trim().length > 0;

    btn.disabled = !(hasFile && hasText);
    
    if (btn.disabled) {
        btn.style.opacity = 0.5;
        btn.style.cursor = 'not-allowed';
    } else {
        btn.style.opacity = 1;
        btn.style.cursor = 'pointer';
    }
}      



// --- FONCTIONS AUTH (LOGIN / REGISTER) ---
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
async function register(event, route) {
    /**
     * Gère l'inscription de l'utilisateur et affiche un message de succès ou d'erreur
     * @param {string} route - L'URL de l'endpoint d'inscription de l'API
     * @param {Event} event - L'événement de soumission du formulaire
     */
    event.preventDefault(); // Empêche le rechargement de la page
    const form = event.target; // Récupère le formulaire à partir de l'événement
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
            responseZone.textContent = data.message;
            responseZone.style.color = "green";
        }
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Erreur d\'inscription');
        }
                
            }
        catch (error) {
            if(responseZone){
                responseZone.textContent = "Erreur:" + error.message;
                responseZone.style.color = "red";
            }
        }
    }

// 1. Gestion du Formulaire d'Analyse (Page Home)
const uploadForm = document.getElementById('UploadForm');
if (uploadForm) {
    uploadForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const cvFile = document.getElementById('cvFile').files[0];
        const jobDesc = document.getElementById('jobOfferDescription').value.trim();
        const btn = document.getElementById('uploadBtn');

        const currentFileFingerprint = cvFile.name + cvFile.size;

        if (currentFileFingerprint === lastAnalyzedFile && jobDesc === lastAnalyzedJobDesc) {
            console.log("Optimisation : Données identiques.");
            return;
        }

        btn.disabled = true;
        document.getElementById('loader').style.display = 'block';

        try {
            const formData = new FormData();
            formData.append('cv', cvFile); // Vérifie si ton backend attend 'cv' ou 'cvFile'
            formData.append('job_offer_description', jobDesc);

            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/analyze`, {
                method: 'POST',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                body: formData
            });

            if (response.ok) {
                const result = await response.json();
                lastAnalyzedFile = currentFileFingerprint;
                lastAnalyzedJobDesc = jobDesc;
                displayAnalysis(result.matching_score, result.analysis_details, result.ats_advice);
            }
        } finally {
            document.getElementById('loader').style.display = 'none';
            btn.disabled = false;
            validateForm();
        }
    });
}

async function checkAuth() {
    /**
     * Vérifie si l'utilisateur est authentifié en vérifiant la présence d'un token dans le localStorage
     * Si le token est absent, redirige vers la page de connexion
     */
    const token = localStorage.getItem('token');
    console.log("Bearer ${token}");

    if (!token) {
        console.log("Token d'authentification manquant, redirection vers la page de connexion...");
        window.location.href = 'index.html';
        return;
    }
    try {
        const response = await fetch(`${API_URL}${"/user/me"}`, {
            method: 'GET',
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        console.log(response);
        if (response.ok) {
            const data = await response.json();
            const userDisplay = document.getElementById('user-display');
            if (userDisplay) {
                userDisplay.textContent = data.username;
            }
        } else {
            console.log("Token d'authentification invalide ou expiré, redirection vers la page de connexion...");
            localStorage.clear();
            window.location.href = 'index.html';
        }
    }
    catch (error) {
        console.error("Erreur lors de la vérification de l'authentification:", error);
    }
    }

async function logout() {
    /**
     * Gère la déconnexion de l'utilisateur en supprimant le token du localStorage et en redirigeant vers la page de connexion
     */
    localStorage.clear();
    console.log("Déconnexion réussie, redirection vers la page de connexion...");
    window.location.href = 'index.html';
}

// --- INITIALISATION DES ÉCOUTEURS (EVENT LISTENERS) ---

// On utilise des conditions 'if' pour vérifier la présence des éléments 
// avant d'ajouter des écouteurs. Cela évite de faire planter le script.

const cvElem = document.getElementById('cvFile');
if (cvElem) {
    cvElem.addEventListener('change', validateForm);
}

const jobElem = document.getElementById('jobOfferDescription');
if (jobElem) {
    jobElem.addEventListener('input', validateForm);
}
// 2. Gestion du Formulaire de Login (Page Index)
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', (event) => {
        login(event, '/login'); 
    });
}

const registrationForm = document.getElementById('registrationForm');
if (registrationForm) {
    registrationForm.addEventListener('submit', (event) => {
        login(event, '/register'); 
    });
}

// Initialisation de l'état du bouton au chargement
validateForm();