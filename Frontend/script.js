const API_URL = "http://127.0.0.1:8000";
let lastAnalyzedFile = "";
let lastAnalyzedJobDesc = "";
let selectedCvId = null;

let currentAnalysis = {cv_text: "", job_desc: "",missing_skills: []};

// --- GESTION BIBLIOTHÈQUE ---
function useSavedCv(cvId, filename) {
    selectedCvId = cvId;
    
    // On affiche l'info du CV sélectionné
    const infoZone = document.getElementById('selected-cv-info');
    infoZone.style.display = 'flex';
    document.getElementById('selected-cv-name').innerText = "📍 Prêt : " + filename;
    
    // On masque tout le bloc Upload (Zone PDF + Checkbox)
    document.getElementById('file-input-container').style.display = 'none';

    validateForm();
}

function clearSelectedCv() {
    selectedCvId = null;
    
    // On masque l'info
    document.getElementById('selected-cv-info').style.display = 'none';
    
    // On réaffiche tout le bloc Upload (Zone PDF + Checkbox)
    document.getElementById('file-input-container').style.display = 'block';
    
    // On vide l'input file par sécurité
    document.getElementById('cvFile').value = "";

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
            const data = await response.json();
            console.log("Analyse reçue:", data);

             // Sauvegarde pour la V2
            currentAnalysis.cv_text = data.extracted_text; // On récupère le texte à la racine
            currentAnalysis.job_desc = jobDesc;
            currentAnalysis.missing_skills = data.analysis.missing_skills || [];

    // APPEL CORRIGÉ : On descend dans l'objet 'analysis'
            displayAnalysis(
                data.analysis.ATS_score,      // 78
                data.analysis.analysis_details, // "Le profil est très solide..."
                data.analysis.ats_advice,     // C'est un tableau (Array) dans ton log
                data.analysis.missing_skills  // C'est un tableau (Array) dans ton log
            );
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
                cvsList.innerHTML = data.cvs.map(cv => {
                    // Vérifie si ce CV est celui actuellement sélectionné
                    const isSelected = selectedCvId === cv.id;
                    const btnText = isSelected ? "Retirer" : "Utiliser";
                    const btnClass = isSelected ? "btn-selected" : "";

                    return `
                    <li class="library-item">
                        <div style="display: flex; flex-direction: column; overflow: hidden;">
                            <span style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                📄 ${cv.filename}
                            </span>
                        </div>
                        <button onclick="handleCvSelection(${cv.id}, '${cv.filename.replace(/'/g, "\\'")}')" 
                                class="btn-cv-action ${btnClass}">
                            ${btnText}
                        </button>
                    </li>`;
                }).join('');
            } else {
                libraryDiv.style.display = 'none';
            }
        }
    } catch (e) {
        console.error("Erreur bibliothèque:", e);
    }
}

async function sendOptimizationRequest() {
    console.log("Tentative d'optimisation..."); // Pour débugger
    const token = localStorage.getItem('token');
    const surveyItems = document.querySelectorAll('.survey-item');
    const optBtn = document.getElementById('optimizeBtn')
    
    let userFeedback = []; // CORRECTION : Tableau vide [] obligatoire pour .push()
    
    // 1. Désactiver le bouton et changer son aspect
    if (optBtn) {
        optBtn.disabled = true;
        optBtn.innerHTML = "⏳ Optimisation en cours...";
        optBtn.style.opacity = "0.7";
        optBtn.style.cursor = "not-allowed";
    }

    surveyItems.forEach((item, index) => {
        const isYes = document.querySelector(`input[name="q_${index}"]:checked`)?.value === "yes";
        if (isYes) {
            const skillName = item.querySelector('strong').innerText; // Correction 'strong' minuscule
            const context = document.getElementById(`note_${index}`).value;
            userFeedback.push({ skill: skillName, context: context });
        }
    });

    if (userFeedback.length === 0) {
        alert("Veuillez confirmer au moins une compétence pour optimiser votre CV.");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/optimize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ 
                cv_text: currentAnalysis.cv_text, 
                job_desc: currentAnalysis.job_desc,
                user_responses: userFeedback // Doit matcher le nom dans ton main.py
            })
        });

        if (response.ok) {
            const result = await response.json();
            displayOptimizedResults(result.optimized_bullets);
        } else {
            const error = await response.json();
            console.error("Erreur serveur :", error);
        }
    } catch (e) {
        console.error("Erreur réseau :", e);
    }
    finally {
        // 2. Réactiver le bouton une fois terminé
        if (optBtn) {
            optBtn.disabled = false;
            optBtn.innerHTML = "Générer la reformulation magique ✨";
            optBtn.style.opacity = "1";
            optBtn.style.cursor = "pointer";
        }
    }
    
}

function displayOptimizedResults(bullets) {
    const container = document.getElementById('analysis-result');
    
    const optCard = document.createElement('div');
    optCard.className = 'card reformulation-card'; // Utilise la classe CSS
    optCard.style.marginTop = "20px";
    optCard.style.border = "2px solid var(--success)";
    optCard.style.textAlign = "left";

    optCard.innerHTML = `
        <h3 style="color: var(--success); margin-top: 0;">✨ Expériences Optimisées (Score 90%+)</h3>
        <p style="font-size: 14px; color: var(--text-muted);">
            Voici vos nouvelles puces d'expériences. Copiez-les directement dans votre CV :
        </p>
        <ul style="list-style-type: none; padding: 0;">
            ${bullets.map(bullet => `
                <li style="margin-bottom: 15px; padding: 16px; background: var(--opt-bg); color: var(--opt-text); border-left: 4px solid var(--success); border-radius: 8px; font-size: 14px; line-height: 1.6;">
                    ${bullet}
                </li>
            `).join('')}
        </ul>
        <button onclick="copyAllBullets()" class="btn-primary" style="background: var(--success); width: auto; padding: 10px 20px;">
            Copier tout le texte
        </button>
    `;

    container.appendChild(optCard);
    optCard.scrollIntoView({ behavior: 'smooth' });
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

function toggleContext(index, show) {
    const textarea = document.getElementById(`note_${index}`);
    if (textarea) {
        textarea.style.display = show ? 'block' : 'none';
        // Petit plus : on met le focus dessus si on l'affiche
        if (show) textarea.focus();
    }
}

function copyAllBullets() {
    const bullets = document.querySelectorAll('#analysis-result ul li');
    const textToCopy = Array.from(bullets).map(li => li.innerText).join('\n\n');
    navigator.clipboard.writeText(textToCopy).then(() => {
        alert("Texte copié dans le presse-papier !");
    });
}
function handleCvSelection(cvId, filename) {
    if (selectedCvId === cvId) {
        // Si on clique sur le même CV, on désélectionne
        clearSelectedCv();
    } else {
        // Sinon, on sélectionne le nouveau
        useSavedCv(cvId, filename);
    }
    // On recharge la liste pour mettre à jour l'apparence des boutons
    loadMyCvs();
}

function logout() {
    localStorage.clear();
    window.location.href = 'index.html';
}

function updateThemeButton(isDark) {
    const btn = document.querySelector('.theme-switch');
    if (btn) {
        btn.innerHTML = isDark ? "☀️ Mode Clair" : "🌙 Mode Sombre";
    }
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    
    // Mise à jour visuelle du bouton
    updateThemeButton(isDark);
}


// Au chargement de la page, on applique le bon texte
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        updateThemeButton(true);
    } else {
        updateThemeButton(false);
    }
});

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