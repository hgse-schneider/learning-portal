import firebase_admin
from firebase_admin import credentials
from firebase_admin import auth
from firebase_admin import exceptions
from firebase_admin import db

def init():
  cred = credentials.Certificate("firebase-adminsdk.json")
  firebase_admin.initialize_app(cred, {
    'projectId': 'lit-public-learning-portal',
    'databaseURL': 'https://lit-public-learning-portal-default-rtdb.firebaseio.com'
  })