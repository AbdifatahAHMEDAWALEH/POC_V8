
const API_URL = "http://127.0.0.1:8000";
const uploadForm = document.getElementById('UploadForm');
let lastAnalyzedFile = null;
let lastAnalyzedJobDesc = "";

function validateForm() {
    /**
     * Valide que les champs du formulaire d'analyse sont correctement remplis avant de permettre la soumission
     * Affiche des messages d'erreur spécifiques pour chaque champ manquant ou incorrect
     **/
    const cvFileInput = document.getElementById('cvFile');
    const jobOfferDescriptionInput = document.getElementById('jobOfferDescription');
    const btn = document.getElementById('uploadBtn');

    btn.disabled = !(cvFileInput && jobOfferDescriptionInput)
    
    if (btn.disabled) {
        btn.style.opacity = 0.5;
        btn.style.cursor = 'not-allowed';
    }
    else {
        btn.style.opacity = 1;
        btn.style.cursor = 'pointer';
    }
}       



async function login(event,route) {
    /**
     * Gère la connexion de l'utilisateur et stocke le token d'authentification dans le localStorage
     * @param {string} route - L'URL de l'endpoint de connexion de l'API
     * @param {Event} event - L'événement de soumission du formulaire
     */
    event.preventDefault();
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
            console.log("Connexion réussie !");
            const data = await response.json();
            localStorage.setItem('token', data.access_token);
            localStorage.setItem('username', values.username);
            responseZone.textContent = "Connexion réussie !";
            responseZone.style.color = "green";
            window.location.href = 'home_page.html';
        }
        if (!response.ok) {
            console.log("Echec de onnexion!");
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Erreur de connexion');
        }
    }
    catch (error) {
        if(responseZone){
            responseZone.textContent = "Erreur:" + error.message;
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

if (uploadForm) {
    uploadForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const cvFile = document.getElementById('cvFile').files[0];
        const jobOfferDescription = document.getElementById('jobOfferDescription').value;
        const token = localStorage.getItem('token');
        const loader = document.getElementById('loader');
        const btn = document.getElementById('uploadBtn');

        const formData = new FormData();
        formData.append('cv', cvFile);
        formData.append('job_offer_description', jobOfferDescription);
        formData.append('authorization', `Bearer ${token}`);

        // Vérifie si le même fichier et la même description ont déjà été analysés pour éviter les requêtes redondantes
        if (cvFile.name === lastAnalyzedFile && jobOfferDescription === lastAnalyzedJobDesc) {
            console.log("Même fichier et description détectés, réutilisation du résultat précédent.");
            return;
        }
        // Affiche le loader et désactive le bouton pendant l'analyse
        loader.style.display = 'block';
        btn.disabled = true;
        btn.innerText = "Analyse en cours...";

        try {
                const response = await fetch(`${API_URL}/analyze`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`
                },
                body: formData,
                keepalive: true
            });
            if (response.ok) {
                lastAnalyzedFile = cvFile;
                lastAnalyzedJobDesc = jobOfferDescription;
                const result = await response.json();
                const analysisResult = document.getElementById('analysis-result');
    
        // On utilise innerHTML pour pouvoir injecter des balises structurées
                analysisResult.innerHTML = `
                <div style="background: #eef6ff; border-left: 5px solid #007bff; padding: 20px; border-radius: 5px;">
                <h2 style="color: #007bff; margin-top: 0;">Score : ${result.matching_score}%</h2>
            
                <h4 style="margin-bottom: 5px;">Analyse :</h4>
                <p style="white-space: pre-wrap; background: white; padding: 10px; border: 1px solid #ddd;">${result.analysis_details}</p>
            
                <h4 style="margin-bottom: 5px;">Conseils ATS :</h4>
                <p style="white-space: pre-wrap; background: white; padding: 10px; border: 1px solid #ddd;">${result.ats_advice || "Non disponible"}</p>
                </div>
                `;
            }
            else {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Erreur lors de l'analyse du CV");
            }
            
        }
        catch (error) {
            const analysisResult = document.getElementById('analysis-result');
            analysisResult.textContent = "Erreur:" + error.message;
        }
        finally {
            // Cache le loader et réactive le bouton après l'analyse
            loader.style.display = 'none';
            btn.disabled = false;
            btn.innerText = "Analyser mon CV";
            validateForm(); // Revalide le formulaire pour ajuster l'état du bouton si nécessaire
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