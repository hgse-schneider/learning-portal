from flask import Flask, render_template, session, request, redirect, flash, Response, send_file, url_for, jsonify
import requests
from werkzeug.utils import secure_filename
import os
import os.path
import zipfile
from os.path import basename
import random

# Firebase database setup
import pyrebase
from requests.exceptions import HTTPError

# dotenv setup
from dotenv import load_dotenv
load_dotenv()

# decorator for routes that should be accessible by specific users only
from authentication_decorator import signin_required, signout_required, admin_required

# socket setup
from flask_socketio import SocketIO, emit

import json
import csv
import datetime
import glob

# App config
app = Flask(__name__)             # create an app instance

# Session config
app.secret_key = os.getenv("APP_SECRET_KEY")

# Flask socket setup
socketio = SocketIO(app, cors_allowed_origins="*")

# Firebase Setup
from firebaseConfig import firebaseConfig

firebase = pyrebase.initialize_app(firebaseConfig)

# Firebase authentication setup
auth = firebase.auth()

# Firebase database setup
db = firebase.database()

# Setup Videos JSON file
global videos

try:
  os.mkdir('tmp')
except:
  pass

try:
  os.mkdir('zips')
except:
  pass

try:
  os.mkdir('affective_states')
except:
  pass

@app.context_processor
def inject_user():
  if ('email' in session):
    return dict(firstname = session['firstname'], lastname = session['lastname'], email = session['email'], type = session['type'])
  else:
    return dict()

@app.route("/")
@signout_required
def index():
  return redirect(url_for('signup'))

@app.route("/signin", methods=['POST', 'GET'])
@signout_required
def signin():
  if request.method == 'POST':
    email = request.form.get('email')
    password = request.form.get('password')
    
    try:
      user = auth.sign_in_with_email_and_password(email, password)
      emailVerified = auth.get_account_info(user['idToken'])['users'][0]['emailVerified']
      if emailVerified == True:
        session['user'] = user['idToken']
        session['email'] = user['email']

        # Get user's additional data from firebase realtime-database
        user_getinfo = db.child('users').order_by_child('email').equal_to(email).get().val()
        user_getinfo = user_getinfo[next(iter(user_getinfo))]
        session['firstname'] = user_getinfo['firstname']
        session['lastname'] = user_getinfo['lastname']
        session['type'] = user_getinfo['type']
        session['new'] = user_getinfo['new']
        
        return redirect(url_for('courses'))
      else:
        auth.current_user = None
        session.clear()
        return render_template('signin.html', email=email, incorrect='true', message="You haven't verified your email yet!")
    except:
      return render_template('signin.html', email=email, incorrect='true', message="Your email or password is incorrect.")
  
  return render_template('signin.html', email="", incorrect='false')

@app.route("/signup", methods=['POST', 'GET'])
@signout_required
def signup():
  if request.method == 'POST':
    firstname = request.form.get('firstname')
    lastname = request.form.get('lastname')
    email = request.form.get('email')
    password = request.form.get('password')

    try:
      user = auth.create_user_with_email_and_password(email, password)
      data = {
        "email": email,
        "firstname": firstname,
        "lastname": lastname,
        "type": "student",
        "new": "true"
      }
      db.child("users").push(data, user['idToken'])

      auth.send_email_verification(user['idToken'])

      return redirect(url_for('verification'))

    except requests.HTTPError as e:
        error_json = e.args[1]
        error = json.loads(error_json)['error']['message']
        if error == "EMAIL_EXISTS":
          return render_template('signup.html', firstname=firstname, lastname=lastname, email=email, error="true", errormessage="This email already exists!")
        else:
          return render_template('signup.html', firstname=firstname, lastname=lastname, email=email, error="true", errormessage=error)
    except:
      return render_template('signup.html', firstname=firstname, lastname=lastname, email=email, error="true", errormessage="Sorry, we're having trouble completing your request right now. Please try again later.")
  
  return render_template('signup.html', firstname="", lastname="", email="", error="false")

@app.route('/passwordrecovery', methods=['POST', 'GET'])
@signout_required
def passwordrecovery():
  if request.method == 'POST':
    email = request.form.get('email')
    # send recovery
    try:
      auth.send_password_reset_email(email)
      return render_template('passwordrecovery.html', sent="true", email=email)
    except:
      return render_template('passwordrecovery.html', error="Your email is invalid.", email=email)
  return render_template('passwordrecovery.html', sent="false")

@app.route('/verification')
@signout_required
def verification():
  return render_template('verification.html')

@app.route('/resendverification', methods=['POST', 'GET'])
@signout_required
def resendverification():
  if request.method == 'POST':
    email = request.form.get('email')
    password = request.form.get('password')
    # send recovery
    try:
      user = auth.sign_in_with_email_and_password(email, password)
      auth.send_email_verification(user['idToken'])
      auth.current_user = None
      session.clear()
      return redirect(url_for('verification'))
    except:
      return render_template('resendverification.html', error="Your email or password is incorrect.", email=email)
  return render_template('resendverification.html', sent="false")

@app.route('/signout')
@signin_required
def logout():
  auth.current_user = None
  session.clear()
  return redirect(url_for('index'))

@app.route('/admin')
@signin_required
@admin_required
def admin():
  return render_template('admin.html')

@app.route('/users')
@signin_required
@admin_required
def users():
  db_users = db.child('users').get().val()
  list_users = []
  for key, value in db_users.items():
    list_users.append([key, value['email'], value['firstname'], value['lastname'], value['type']])
  return render_template('users.html', users = list_users)

def raise_detailed_error(request_object):
  try:
    request_object.raise_for_status()
  except HTTPError as e:
    raise HTTPError(e, request_object.text)

@app.route('/users/add-users', methods=['POST', 'GET'])
@signin_required
@admin_required
def addUsers():
  if request.method == 'POST':
    firstname = request.form.get('firstname')
    lastname = request.form.get('lastname')
    email = request.form.get('email')
    password = request.form.get('password')

    try:
      user = auth.create_user_with_email_and_password(email, password)
      data = {
        "email": email,
        "firstname": firstname,
        "lastname": lastname,
        "new": "true",
        "type": "student"
      }
      db.child("users").push(data)

      auth.send_email_verification(user['idToken'])

      return render_template('add-users.html', firstname=firstname, lastname=lastname, email=email, error="false", success="true", successmessage="Account created!")

    except requests.HTTPError as e:
        error_json = e.args[1]
        error = json.loads(error_json)['error']['message']
        if error == "EMAIL_EXISTS":
          return render_template('add-users.html', firstname=firstname, lastname=lastname, email=email, error="true", errormessage="This email already exists!")
        else:
          return render_template('add-users.html', firstname=firstname, lastname=lastname, email=email, error="true", errormessage=error)
    except:
      return render_template('add-users.html', firstname=firstname, lastname=lastname, email=email, error="true", errormessage="Sorry, we're having trouble completing your request right now. Please try again later.")

  return render_template('add-users.html')

@app.route('/videos')
@signin_required
@admin_required
def videos():
  list_videos = {}
  with open("static/videos/video_index.json", "r+") as f:
    list_videos = json.load(f)

  try:
    id = request.args.get('id')
    if 'edit-video-success' in session:
      success = session['edit-video-success']
      session.pop('edit-video-success', None)
      return render_template('video.html', id=id, video=list_videos[id], success=success)
    return render_template('video.html', id=id, video=list_videos[id])
  
  except:
    if 'delete-video-success' in session:
      success = session['delete-video-success']
      session.pop('delete-video-success', None)
      return render_template('videos.html', videos=list_videos, success=success)
    return render_template('videos.html', videos=list_videos)

@app.route('/videos/delete-video', methods=['POST', 'GET'])
@signin_required
@admin_required
def deleteVideo():
  list_videos = {}
  with open("static/videos/video_index.json", "r+") as f:
    list_videos = json.load(f)

  id = request.args.get('id')
  
  os.remove('static/videos/thumbnails/' + id + list_videos[id]['thumbnail_extension'])
  os.remove('static/videos/videos/' + id + '.mp4')
  list_videos.pop(id, None)

  with open("static/videos/video_index.json", "w") as f:
    json.dump(list_videos, f)

  session['delete-video-success'] = 'Video deleted'
  return redirect(url_for('videos'))

@app.route('/videos/edit-video', methods=['POST', 'GET'])
@signin_required
@admin_required
def editVideo():
  list_videos = {}
  with open("static/videos/video_index.json", "r+") as f:
    list_videos = json.load(f)
  if request.method == 'POST':
    id = request.args.get('id')
    title = request.form.get('title')
    caption = request.form.get('caption')

    # check if the post request has an uploaded thumbnail
    if 'thumbnail' in request.files and request.files['thumbnail'].filename != '':
      # remove old thumbnail file
      os.remove('static/videos/thumbnails/' + id + list_videos[id]['thumbnail_extension'])

      # save new thumbnail file
      thumbnail = request.files['thumbnail']
      thumbnail_extension = os.path.splitext(thumbnail.filename)[1]
      thumbnail_name = str(id) + thumbnail_extension
      thumbnail_name = secure_filename(thumbnail_name)
      thumbnail.save('static/videos/thumbnails/' + thumbnail_name)
      list_videos[id]['thumbnail_extension'] = thumbnail_extension

    list_videos[id]['name'] = title
    list_videos[id]['caption'] = caption

    with open("static/videos/video_index.json", "w") as f:
      json.dump(list_videos, f)

    session['edit-video-success'] = 'Changes saved'
  return redirect(url_for('videos', id=id))

@app.route('/add-video', methods=['POST', 'GET'])
@signin_required
@admin_required
def addVideo():
  if request.method == 'POST':
    title = request.form.get('title')
    video = request.files['video']
    thumbnail = request.files['thumbnail']
    caption = request.form.get('caption')

    video_id = random.randint(100000,999999)

    # save video file
    video_extension = os.path.splitext(video.filename)[1]
    video_name = str(video_id) + video_extension
    video_name = secure_filename(video_name)
    video.save('static/videos/videos/' + video_name)

    # save thumbnail file
    thumbnail_extension = os.path.splitext(thumbnail.filename)[1]
    thumbnail_name = str(video_id) + thumbnail_extension
    thumbnail_name = secure_filename(thumbnail_name)
    thumbnail.save('static/videos/thumbnails/' + thumbnail_name)

    # add video to database
    with open("static/videos/video_index.json", "r+") as f:
      data = json.load(f)
      video_data = {
        str(video_id): {
          "name": title,
          "caption": caption,
          "thumbnail_extension": thumbnail_extension,
        }
      }
      data.update(video_data)
      f.seek(0)
      json.dump(data, f)

    return render_template('add-video.html', success="true", successmessage="Video added successfully!")

  return render_template('add-video.html')

@app.route("/courses")
@signin_required
def courses():
  global videos

  with open('static/videos/video_index.json') as f:
    videos = json.load(f)

  if session['new'] == "true":
    session['new'] = "false"

    # update in database!
    users = db.child("users").get()
    for user in users.each():
      if user.val()['email'] == session['email']:
        db.child("users").child(user.key()).update({'new': 'false'})
        break
    
    return render_template('courses.html', videos=videos, new = "true")

  else:
    return render_template('courses.html', videos=videos, new = "false")

@app.route("/watch")
@signin_required
def watch():
  global videos
  with open('static/videos/video_index.json') as f:
    videos = json.load(f)
  
  try:
    v = request.args.get('v')
    session['video'] = v

    name = videos[v]['name']
    caption = videos[v]['caption']
    thumbnail_extension = videos[v]['thumbnail_extension']

    return render_template('watch.html', video=v, video_name=name, video_caption=caption, thumbnail_extension=thumbnail_extension)
  
  except:
    return redirect(url_for('courses'))

@socketio.on('connect')
def connect():
  session['datetime'] = session['video'] + '_' + session['email'] + '_' + datetime.datetime.now().strftime("%y%m%d_%H%M%S")
  os.mkdir("tmp/" + session['datetime'])
  emit('connected')

@socketio.on('pose_data')
def pose_data(data):
  arr = json.loads(data)

  with open('tmp/' + session['datetime'] + '/pose' +'.csv','a') as result_file:
      wr = csv.writer(result_file, dialect='excel')
      for i in arr['predictions']:
        wr.writerows(i)

@socketio.on('emotion_data')
def emotion_data(data):
  arr = json.loads(data)

  with open('tmp/' + session['datetime'] + '/emotion' +'.csv','a') as result_file:
      wr = csv.writer(result_file, dialect='excel')
      for i in arr['predictions']:
        wr.writerows(i)

@socketio.on('eye_data')
def eye_data(data):
  arr = json.loads(data)

  with open('tmp/' + session['datetime'] + '/eye' +'.csv','a') as result_file:
      wr = csv.writer(result_file, dialect='excel')
      for i in arr['predictions']:
        wr.writerows(i)

@socketio.on('affective_states_data_receive')
def affective_states_data_receive():
  filename = 'affective_states/' + session['email']+ '_' + session['video'] + '.csv'
  if os.path.exists(filename):
    with open(filename) as file:
      csv_reader = csv.reader(file)
      list_of_rows = list(csv_reader)
      emit('affective_states_data_receive', list_of_rows[1:])
  else:
    emit('affective_states_data_receive', [])

@socketio.on('affective_states_data_store')
def affective_states_data_store(data):
  filename = 'affective_states/' + session['email']+ '_' + session['video'] + '.csv'
  if not os.path.exists(filename):
    with open(filename,'a') as result_file:
      wr = csv.writer(result_file, dialect='excel')
      wr.writerows([['video_timestamp', 'affective_state']])

  arr = json.loads(data)

  with open(filename,'a') as result_file:
    wr = csv.writer(result_file, dialect='excel')
    wr.writerows(arr)

@socketio.on('send_class_states')
def send_class_states():
  all_states = []
  filenames = glob.glob('affective_states/' + '*_' + str(session['video'][:-1]) + '[0-9].csv')
  for file in filenames:
    if file[17:42] != 'javariahassan98@gmail.com' and file[17:42] != 'javariahassan23@gmail.com' and file[17:51] != "bertrand_schneider@gse.harvard.edu":
      with open(file) as f:
        reader = csv.reader(f)
        all_states += list(reader)[1:]
  
  emit('receive_class_states', all_states)

@socketio.on('clickstream')
def clickstream(data):
  arr = json.loads(data)

  with open('tmp/' + session['datetime'] + '/clickstream' +'.csv','a') as result_file:
      wr = csv.writer(result_file, dialect='excel')
      for i in arr['clickstream']:
        wr.writerows(i)

@app.route("/data")
@signin_required
def data():
  tmp_folders = []
  affectivestates_files = []
  for root, dirs, files in os.walk('tmp/'):
    for folder_name in dirs:
      if session['email'] in folder_name[8:]:
        tmp_folders.append('tmp/'+folder_name)
  
  for file_name in os.listdir('affective_states/'):
    if session['email'] in file_name:
      affectivestates_files.append('affective_states/'+file_name)

  return render_template('data.html', tmp_folders=tmp_folders, affectivestates_files=affectivestates_files)

@app.route("/data_file_multimodal")
@signin_required
def data_file_multimodal():
  v = request.args.get('v')
  t = request.args.get('t')
  n = request.args.get('n')

  try:
    return send_file('tmp/'+v+'_'+session['email']+'_'+t+'/'+n, mimetype='text/csv', as_attachment=True, attachment_filename=v+'_'+session['email']+'_'+t+'_'+n)
  except Exception as e:
    return str(e)

@app.route("/data_file_affectivestates")
@signin_required
def data_file_affectivestates():
  v = request.args.get('v')

  try:
    return send_file('affective_states/'+session['email']+'_'+v, mimetype='text/csv', as_attachment=True, attachment_filename=session['email']+'_'+v)
  except Exception as e:
    return str(e)

@app.route("/data_file_all")
@signin_required
def data_file_all():
  zipf = zipfile.ZipFile('zips/'+session['email']+'.zip','w', zipfile.ZIP_DEFLATED)

  for root, dirs, files in os.walk('tmp/'):
    for folder_name in dirs:
      if session['email'] in folder_name[8:]:
        for i in ['pose', 'eye', 'emotion', 'clickstream']:
          filename = 'tmp/'+folder_name+'/'+i+'.csv'
          if os.path.isfile(filename):
            zipf.write(filename)

  for file_name in os.listdir('affective_states/'):
    if session['email'] in file_name:
      zipf.write('affective_states/'+file_name)
      break
  
  zipf.close()
  return send_file('zips/'+session['email']+'.zip',
          mimetype = 'zip',
          attachment_filename= 'data_'+session['email']+'.zip',
          as_attachment = True)

if __name__ == "__main__":                          # on running python app.py
  socketio.run(app, host='127.0.0.1', debug=True)   # run the flask app