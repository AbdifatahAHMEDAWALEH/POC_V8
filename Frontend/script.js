const API_URL = "http://127.0.0.1:8000";
let lastAnalyzedFile = "";
let lastAnalyzedJobDesc = "";
let selectedCvId = null;

let currentAnalysis = {cv_text: "", job_desc: "",missing_skills: []};

// Utilitaire pour éviter les crashs si un élément manque
const setElementValue = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
};

// Utilisation dans useSavedCv :
setElementValue('cvFile', "");

// --- GESTION BIBLIOTHÈQUE ---
function useSavedCv(cvId, filename) {
    selectedCvId = cvId;
    const cvFileInput = document.getElementById('cvFile');
    
    // Ajout d'une sécurité : on ne change la valeur que si l'élément existe
    if (cvFileInput) {
        cvFileInput.value = ""; 
    }
    
    const infoZone = document.getElementById('selected-cv-info');
    const nameDisplay = document.getElementById('selected-cv-name');
    const inputContainer = document.getElementById('file-input-container');

    if (infoZone) infoZone.style.display = 'flex';
    if (nameDisplay) nameDisplay.innerText = "📍 Prêt : " + filename;
    if (inputContainer) inputContainer.style.display = 'none';

    validateForm();
}

function clearSelectedCv() {
    selectedCvId = null; 
    
    document.getElementById('selected-cv-info').style.display = 'none';
    document.getElementById('file-input-container').style.display = 'block';

    const uploadWrapper = document.querySelector('.file-upload-wrapper');
    const uploadSpan = uploadWrapper.querySelector('span'); // On cible le span spécifiquement

    if (uploadSpan) {
        uploadSpan.innerText = "📁 Cliquez pour uploader un CV (PDF)";
    }

    // ON NE TOUCHE PAS au innerHTML du wrapper pour garder l'input vivant
    uploadWrapper.style.borderColor = "var(--border)";
    uploadWrapper.style.background = "transparent";

    // L'input existe toujours, on peut donc vider sa valeur
    const fileInput = document.getElementById('cvFile');
    if (fileInput) fileInput.value = "";

    validateForm(); 
    loadMyCvs();
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
            displayOptimizedResults(result);
            console.log("Optimisation réussie:", result);
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


function displayOptimizedResults(data) {
    const container = document.getElementById('analysis-result');
    // On s'assure d'accéder au tableau, même si la structure varie légèrement
    const experiences = data.optimized_experiences || [];

    const optCard = document.createElement('div');
    optCard.className = 'card reformulation-card';
    optCard.style.marginTop = "20px";
    optCard.style.border = "2px solid var(--success)";

    let htmlContent = `
        <h3 style="color: var(--success); margin-top: 0;">✨ CV Optimisé (Prêt à l'emploi)</h3>
        <p style="font-size: 14px; color: var(--text-muted); margin-bottom: 20px;">
            Voici vos expériences restructurées selon votre feedback et l'offre d'emploi.
        </p>
    `;

    experiences.forEach(exp => {
        // Sécurité : on récupère les puces ou on utilise le champ details si puces est absent
        const pucesAAfficher = exp.puces || (exp.details ? [exp.details] : ["Aucun détail fourni"]);
        
        htmlContent += `
            <div class="exp-block" style="margin-bottom: 25px; padding-bottom: 15px; border-bottom: 1px solid var(--border); text-align: left;">
                <div style="display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 5px;">
                    <strong style="font-size: 1.1rem; color: var(--primary);">${exp.poste || "Poste non précisé"}</strong>
                    <em style="font-size: 0.85rem; color: var(--text-muted);">${exp.dates || ""}</em>
                </div>
                <div style="font-weight: 600; margin-bottom: 10px; color: var(--text-main);">${exp.entreprise || ""}</div>
                <ul style="list-style-type: disc; padding-left: 20px; margin: 0;">
                    ${pucesAAfficher.map(puce => `
                        <li style="margin-bottom: 8px; font-size: 14px; color: var(--opt-text); line-height: 1.5;">${puce}</li>
                    `).join('')}
                </ul>
            </div>
        `;
    });

    htmlContent += `
        <button onclick="copyAllBullets()" class="btn-primary" style="background: var(--success); width: auto; padding: 10px 25px; margin-top: 10px;">
            Copier le CV optimisé
        </button>
    `;

    optCard.innerHTML = htmlContent;
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
        // Désélection : on nettoie tout
        clearSelectedCv();
    } else {
        // Sélection : on active le CV choisi
        useSavedCv(cvId, filename);
    }
    // Mise à jour visuelle des boutons dans la sidebar
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
function resetUploadWrapper() {
    const uploadWrapper = document.querySelector('.file-upload-wrapper');
    uploadWrapper.innerHTML = `<span>📁 Cliquez pour uploader un CV (PDF)</span>`;
    uploadWrapper.style.borderColor = "var(--border)";
    uploadWrapper.style.background = "transparent";
}

// --- ÉCOUTEURS ---

const cvInput = document.getElementById('cvFile');
if (cvInput) 
    {
        cvInput.addEventListener('change', function(e) {
        const fileName = e.target.files[0]?.name;
        const uploadWrapper = document.querySelector('.file-upload-wrapper');
        if (fileName) {
        // Changement visuel pour confirmer la sélection
        uploadWrapper.innerHTML = `
            <span style="color: var(--success); font-weight: 600;">
                ✅ Fichier prêt : ${fileName}
            </span>
            <small style="display: block; color: var(--text-muted); margin-top: 5px;">
                Cliquez à nouveau pour changer
            </small>
        `;
        uploadWrapper.style.borderColor = "var(--success)";
        uploadWrapper.style.background = "rgba(16, 185, 129, 0.05)";
    }
    validateForm();
    });
}

const jobInput = document.getElementById('jobOfferDescription');
if (jobInput) jobInput.addEventListener('input', validateForm);

const loginF = document.getElementById('loginForm');
if (loginF) loginF.addEventListener('submit', (e) => login(e, '/login'));

const regF = document.getElementById('registrationForm');
if (regF) regF.addEventListener('submit', (e) => register(e, '/register'));

// Initialisation
validateForm();
checkAuth();