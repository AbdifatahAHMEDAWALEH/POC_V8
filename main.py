from sqlalchemy import create_engine, Column, Integer, String, ForeignKey, Text, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship, Session
from sqlalchemy import desc
from pydantic import BaseModel
from passlib.context import CryptContext
from fastapi import FastAPI, HTTPException, Header
from contextlib import contextmanager
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta
from typing import Optional
import jwt
from jwt import PyJWTError
from fastapi.staticfiles import StaticFiles
import os
import fitz  # PyMuPDF
import io
from fastapi import File, UploadFile, Form
import json
import ollama
import hashlib
from datetime import datetime
from typing import List

last_state = {
    "last_cv":"",
    "last_job_offer":"",
    "last_cv_hash":"",
    "last_job_offer_hash":""
}

first_analysis = ""


filter_system_prompt = """Tu es un filtre. Ton but est de déterminer si le texte fourni est une demande d'analyse de CV par rapport à une offre d'emploi. 
Réponds uniquement par "oui" ou "non"."""
main_system_prompt = """Tu es un expert en recrutement et optimisation de CV pour les systèmes ATS.
Ton but est d'aider le candidat à passer les filtres automatiques. Ta réponse doit être en langue française.
Réponds EXCLUSIVEMENT en JSON avec cette structure :
{
    "ATS_score": 85,
    "analysis_details": "Analyse globale du profil...",
    "ats_advice": "Liste des mots-clés techniques de l'offre absents du CV...",
    "missing_skills": ["skill1", "skill2", "skill3"], (liste des 3 compétences ou outils techniques les plus importants mentionnés dans l'offre mais absents du CV)

}
Aucun autre texte ne doit être présent dans ta réponse, uniquement ce JSON"""

JOB_STRUCTURING_PROMPT = """Tu es un expert en analyse de données de recrutement.
Ta mission est d'extraire les informations essentielles d'une offre d'emploi.
Réponds EXCLUSIVEMENT en JSON avec cette structure :
{
    "titre_poste": "Nom du poste",
    "missions_cles": ["mission 1", "mission 2"],
    "hard_skills": ["competence technique 1", "outil 2"],
    "soft_skills": ["qualité 1"],
    "niveau_experience": "Sénior/Junior/etc"
}
Tout texte inutile (avantages, présentation entreprise) doit être ignoré."""

CV_STRUCTURING_PROMPT = """Tu es un expert en analyse de CV.
Ta mission est d'extraire les expériences professionnel et les skills si ils sont présents dans le Cv.
Réponds EXCLUSIVEMENT en JSON avec cette structure :
{
    "experiences": [],
    "skills": []
}
Si le CV ne contient pas de section "Compétences" ou "Skills", tu dois  analyser les descriptions d'expériences pour en extraire les compétences techniques mentionnées.""" 

OPTIMIZE_SYSTEM_PROMPT = """Tu es un rédacteur professionnel de CV techniques. 
Ta mission est de reformuler les descriptions d'expériences pour intégrer les compétences validées, tout en conservant la structure originale du CV.

Tu dois répondre EXCLUSIVEMENT avec un JSON suivant cette structure stricte :
{
    "optimized_experiences": [
        {
            "poste": "Intitulé du poste original",
            "entreprise": "Nom de l'entreprise originale",
            "dates": "Dates originales",
            "puces": ["Puce reformulée 1", "Puce reformulée 2"]
        }
    ]
}

CONSIGNES :
1. Le nombre d'objets dans "optimized_experiences" doit être identique au nombre d'expériences du CV.
2. Si une expérience n'est pas modifiée, recopie ses puces originales dans le champ "puces".
3. Ne fournis aucun texte avant ou après le JSON."""

# On remonte d'un cran pour trouver le dossier frontend
current_dir = os.path.dirname(os.path.realpath(__file__))
frontend_dir = os.path.join(current_dir,"Frontend")
analysis_cache = {}

# --- Configuration de la sécurité ---
SECRET_KEY = "my-secret-key"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# --- configuration du hashage des mots de passe ---
pwd_context = CryptContext(schemes=["bcrypt_sha256"], deprecated="auto")

# --- function pour créer le token d'accès ---
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# --- initialisation de l'application
app = FastAPI()


# --- configuration du CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Base de données ---
DATABASE_URL = "sqlite:///./accounts.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Account(Base):
    __tablename__ = "accounts"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True)
    hashed_password = Column(String)
    first_name = Column(String)
    last_name = Column(String)
    email = Column(String, unique=True)
    documents = relationship("Document", back_populates="owner", cascade="all, delete-orphan")

class Document(Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String)
    content = Column(String)
    created_at = Column(String)
    user_id = Column(Integer, ForeignKey("accounts.id"))
    owner = relationship("Account", back_populates="documents")

class User_registration(BaseModel):
    username: str
    password: str
    first_name: str
    last_name: str
    email: str

class UserAuth(BaseModel):
    username: str
    password: str

class UserInfo(BaseModel):
    username: str

class userCV(BaseModel):
    filename: str
    content: str
    created_at: str

class SkillFeedback(BaseModel):
    skill: str
    context: str

class OptimizationRequest(BaseModel):
    cv_text: str
    job_desc: str
    user_responses: List[SkillFeedback]

# --- création de la base de données ---
Base.metadata.create_all(bind=engine)


def get_password_hash(password):
    return pwd_context.hash(password)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

@contextmanager
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --- endpoint pour la connexion des utilisateurs ---
@app.post("/login")
async def login(user: UserAuth):
    with get_db() as db:
        try:
            # Vérifier si l'utilisateur existe
            db_user = db.query(Account).filter(Account.username == user.username).first()
            if not db_user or not verify_password(user.password, db_user.hashed_password):
                raise HTTPException(status_code=400, detail="Incorrect username or password")
            # Créer un token d'accès
            access_token = create_access_token(data={"sub": db_user.username})
            return {
                "access_token": access_token,
                "token_type": "bearer",
                "user_id": db_user.id,
                "message": "Connexion réussie"
            }
        except HTTPException as e:
            raise e
        except Exception as e:
            raise HTTPException(status_code=500, detail="Erreur lors de la connexion")
        

# --- Fonction pour obtenir l'utilisateur actuel à partir du token d'accès ---
def get_current_user(token: str = Header(None)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: Optional[str] = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return username
    except PyJWTError:
        raise HTTPException(status_code=401, detail="Séssion invalide ou expirée")
    

# --- endpoint pour obtenir les informations de l'utilisateur actuel ---
@app.get("/user/me")
async def get_user_info(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Aucun token de session fourni")
    try:
        token = authorization.split(" ")[1]
        username = get_current_user(token)
        return {"username": username, "message": "Identité de l'utilisateur vérifiée avec succès"}
    except Exception as e:
        raise HTTPException(status_code=401, detail="Token invalide ou expiré")
    
# --- endpoint pour l'inscription des utilisateurs ---
@app.post("/register")
async def user_registration(user: User_registration):
    with get_db() as db:
        try:
            existing_users = db.query(Account).filter(Account.username == user.username).first() or db.query(Account).filter(Account.email == user.email).first()
            if existing_users:
                raise HTTPException(status_code=400, detail="user already exists")
            
            # Créer un nouvel utilisateur
            new_user = Account(
                username=user.username,
                hashed_password=get_password_hash(user.password),
                first_name=user.first_name,
                last_name=user.last_name,
                email=user.email
            )
            db.add(new_user)
            db.commit()
            db.refresh(new_user)
            return {"message": "User registered successfully", "user_id": new_user.id}
        except HTTPException as e:
            raise e
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))
        
def filter(question):
    response = ollama.chat(model="gemma4:e2b", messages=[{'role': 'system', 'content': filter_system_prompt}, {'role': 'user', 'content': question}])
    return response['message']['content'].strip().lower() == "oui"

def main_model(question):
    response = ollama.chat(
        model="gemma4:e4b", 
        messages=[{'role': 'system', 'content': main_system_prompt}, {'role': 'user', 'content': question}], 
        stream=True
    )


def analyse_cv(text_extrait, job_offer_description):
    question = f"CV:\n{text_extrait}\n\nOffre d'emploi:\n{job_offer_description}"
    
    # 1. Appel Ollama
    response = ollama.chat(
        model="gemma4:e4b", 
        messages=[{'role': 'system', 'content': main_system_prompt}, {'role': 'user', 'content': question}]
    )
    
    # 2. Récupération du texte brut
    contenu_brut = response['message']['content']
    print(f"DEBUG IA : {contenu_brut}") # Pour voir ce que l'IA répond vraiment dans ton terminal

    try:
        # 3. Nettoyage : On cherche le premier '{' et le dernier '}'
        # Cela permet d'ignorer tout texte avant ou après le JSON
        debut = contenu_brut.find('{')
        fin = contenu_brut.rfind('}') + 1
        
        if debut == -1 or fin == 0:
            raise ValueError("L'IA n'a pas renvoyé de JSON valide")

        json_propre = contenu_brut[debut:fin]
        
        # 4. Conversion
        return json.loads(json_propre)
        
    except (json.JSONDecodeError, ValueError) as e:
        print(f"Erreur de parsing JSON : {e}")
        # On renvoie une réponse de secours pour éviter l'erreur 500
        return {
            "ATS_score": 0,
            "analysis_details": "L'IA a répondu dans un format illisible. Essayez de reformuler."
        }

def get_hash(data):
    # Si c'est du texte (str), on l'encode. Si c'est des bytes, on les garde tels quels.
    if isinstance(data, str):
        data = data.encode()
    return hashlib.md5(data).hexdigest()



# Correction du type : db doit être une Session, pas un Account
def save_cv(db: Session, text: str, user_id: int, filename: str):
    new_document = Document(
        filename=filename,
        content=text,            # Utilise 'content' (selon ton modèle Document)
        user_id=user_id,         # NE PAS OUBLIER de lier l'utilisateur !
        created_at=datetime.utcnow().isoformat()
    )
    db.add(new_document)
    db.commit()
    db.refresh(new_document)
    return new_document
        
@app.post("/analyze")
async def analyze(cv: Optional[UploadFile] = File(None),
                  cv_id: Optional[int] = Form(None),
                  job_offer_description: str = Form(...),
                  authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Token manquant")
    
    token= authorization.split(" ")[1]
    username = get_current_user(token)

    # ETAPE 1 : extraction du text du cv (soit depuis le fichier uploadé, soit depuis la base de données selon cv_id)        
    try:
        with get_db() as db:
            user = db.query(Account).filter(Account.username == username).first()
            if not user:
                raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
            text_extrait = ""
            if cv:
                pdf_bytes = await cv.read()
                doc = fitz.open(stream=pdf_bytes, filetype="pdf")
                text_extrait = "".join([page.get_text() for page in doc])
                doc.close()
            elif cv_id:
                db_doc = db.query(Document).filter(Document.id == cv_id, Document.user_id == user.id).first()
                if not db_doc:
                    raise HTTPException(status_code=404, detail="CV non trouvé")
                text_extrait = db_doc.content
            print(f"DEBUG CV extrait : {text_extrait[:500]}...") # Affiche les 500 premiers caractères du CV pour vérification
            # ETAPE 2 : Structuration de l'offre
            Job_struct_response = ollama.chat(
                model="gemma4:e2b",
                messages=[{'role': 'system', 'content': JOB_STRUCTURING_PROMPT}, {'role': 'user', 'content': job_offer_description}]
            )
            print(f"DEBUG Offre brute : {Job_struct_response['message']['content']}") # Affiche la réponse brute de l'IA pour vérification
            first_analysis = ""
            first_analysis = analyse_cv(text_extrait, Job_struct_response)
            return {
            "analysis": first_analysis,
            "extracted_text": text_extrait
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

            

@app.post("/save-cv")
async def save_cv_endpoint(cv: UploadFile = File(...), authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Token manquant")
    try:
        token = authorization.split(" ")[1]
        username = get_current_user(token)
        
        pdf_bytes = await cv.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        text_extrait = "".join([page.get_text() for page in doc])
        doc.close()
        
        with get_db() as db:
            user = db.query(Account).filter(Account.username == username).first()
            if not user:
                raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
            
            new_doc = save_cv(db, text_extrait, user.id, cv.filename)
            return {"message": "CV enregistré avec succès", "cv_id": new_doc.id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    

@app.get("/my-cvs")
async def get_my_cvs(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Token manquant")
    try:
        token = authorization.split(" ")[1]
        username = get_current_user(token)
        
        with get_db() as db:
            user = db.query(Account).filter(Account.username == username).first()
            if not user:
                raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
            
            cvs = db.query(Document).filter(Document.user_id == user.id).order_by(Document.id.desc()).all()
            return {"cvs": [{"id": cv.id, "filename": cv.filename} for cv in cvs]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@app.post("/optimize")
async def optimize_cv(data: OptimizationRequest, authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Token manquant")
    
    # Préparation du texte de feedback avec mention explicite de l'expérience cible
    feedback_text = "\n".join([
        f"- {f.skill} (Lieu/Contexte précisé: {f.context if f.context else 'Non précisé, à déduire'})" 
        for f in data.user_responses
    ])
    print(f"DEBUG Feedback formaté pour l'IA : {feedback_text}") # Affiche le feedback formaté pour vérification

    cv_structure_response = ollama.chat(
        model="gemma4:e2b", 
        messages=[{'role': 'system', 'content': CV_STRUCTURING_PROMPT}, {'role': 'user', 'content': data.cv_text}]
    )
    print(f"DEBUG Optimized CV response : {cv_structure_response['message']['content']}") # Affiche la réponse brute de l'IA pour vérification
    user_content = f"""
    EXPERIENCES PROFESSIONNELLES DU CANDIDAT :
    {cv_structure_response}

    COMPÉTENCES À INTÉGRER PRIORITAIREMENT :
    {feedback_text}
    """
    print(f"DEBUG Contenu envoyé à l'IA pour optimisation : {user_content}") # Affiche le contenu final envoyé à l'IA pour vérification
    response = ollama.chat(
        model="gemma4:e4b", 
        messages=[
            {'role': 'system', 'content': OPTIMIZE_SYSTEM_PROMPT}, # PROMPT DÉDIÉ
            {'role': 'user', 'content': user_content}
        ]
    )
    print(f"DEBUG Optimized CV response brute : {response['message']['content']}") # Affiche la réponse brute de l'IA pour vérification

    contenu = response['message']['content']
    debut, fin = contenu.find('{'), contenu.rfind('}') + 1
    return json.loads(contenu[debut:fin])



app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="Frontend")