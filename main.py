from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
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


filter_system_prompt = """Tu es un filtre. Ton but est de déterminer si le texte fourni est une demande d'analyse de CV par rapport à une offre d'emploi. 
Réponds uniquement par "oui" ou "non"."""
main_system_prompt = """Tu es un expert en recrutement et optimisation de CV pour les systèmes ATS.
Ton but est d'aider le candidat à passer les filtres automatiques. Ta réponse doit être en langue française.
Réponds EXCLUSIVEMENT en JSON avec cette structure :
{
    "matching_score": 85,
    "analysis_details": "Analyse globale du profil...",
    "ats_advice": "Liste des mots-clés techniques de l'offre absents du CV...",
    "improvement_tips": "Conseils de mise en forme ou d'ajustement des titres de postes..."
}"""

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

def main_model_stream(question):
    response = ollama.chat(
        model="gemma4:26b", 
        messages=[{'role': 'system', 'content': main_system_prompt}, {'role': 'user', 'content': question}], 
        stream=True
    )


def analyse_cv(text_extrait, job_offer_description):
    question = f"CV:\n{text_extrait}\n\nOffre d'emploi:\n{job_offer_description}"
    
    # 1. Appel Ollama
    response = ollama.chat(
        model="gemma4:26b", 
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
            "matching_score": 0,
            "analysis_details": "L'IA a répondu dans un format illisible. Essayez de reformuler."
        }

def get_hash(text):
    return hashlib.sha256(text.encode()).hexdigest()
        
@app.post("/analyze")
async def analyze(cv: UploadFile = File(...),
                  job_offer_description: str = Form(...),
                  authorization: str = Header(None)):
    if not authorization:
            raise HTTPException(status_code=401, detail="Aucun token de session fourni")
    try:
        pdf_bytes = await cv.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        text_extrait = ""
        for page in doc:
            text_extrait += page.get_text()
        doc.close()

        return analyse_cv(text_extrait, job_offer_description)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    



app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="Frontend")