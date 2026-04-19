
const API_URL = "http://127.0.0.1:8000";
const uploadForm = document.getElementById('UploadForm');

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

        const formData = new FormData();
        formData.append('cv', cvFile);
        formData.append('job_offer_description', jobOfferDescription);

        try {
                const response = await fetch(`${API_URL}/upload_cv`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`
                },
                body: formData
            });
            if (response.ok)
            {
                const result = await response.json();
                const analysisResult = document.getElementById('analysis-result');
                analysisResult.textContent = `Score de correspondance: ${result.matching_score}%\n\nDétails de l'analyse:\n${result.analysis_details}`;
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



const loginForm = document.getElementById('loginForm');
if (loginForm) {
    // On utilise une fonction fléchée pour passer 'event' ET la route
    loginForm.addEventListener('submit', (event) => {
        login(event, '/login'); 
    });
}

const registrationForm = document.getElementById('registrationForm');
if (registrationForm) {
    // On utilise une fonction fléchée pour passer 'event' ET la route
    registrationForm.addEventListener('submit', (event) => {
        register(event, '/register'); 
    });
}