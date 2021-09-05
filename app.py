from flask import Flask, render_template, session, request, redirect, flash, Response, send_file, url_for, jsonify, abort, make_response
import requests
from werkzeug.utils import secure_filename
import os
import os.path
import zipfile
from os.path import basename
import random
import time
import json
import csv
import datetime
import glob

# dotenv setup
from dotenv import load_dotenv
load_dotenv()

# socket setup
from flask_socketio import SocketIO, emit

# App config
app = Flask(__name__)             # create an app instance

# Session config
app.secret_key = os.getenv("APP_SECRET_KEY")

# Flask socket setup
socketio = SocketIO(app, cors_allowed_origins="*")

# Firebase New Setup
import firebase_setup
from firebase_setup import credentials, auth, db, exceptions
# decorator for routes that should be accessible by specific users only
from authentication_decorator import signin_required, signout_required, admin_required
firebase_setup.init()

# Setup Videos JSON file
global videos

# Create folders to store user multimodal data
if not os.path.exists('tmp'):
  os.mkdir('tmp')
if not os.path.exists('zips'):
  os.mkdir('zips')
if not os.path.exists('affective_states'):
  os.mkdir('affective_states')

@app.context_processor
def inject_user():
  session_cookie = request.cookies.get('session_fb')
  if session_cookie and 'user_details' in session:
    return dict(user_details = session['user_details'])
  else:
    return dict()

@app.route("/")
@signout_required
def index():
  return redirect(url_for('signup'))

@app.route('/signin', methods=['POST', 'GET'])
@signout_required
def signin():
  if request.method == 'POST':
    # Get the ID token sent by the client
    id_token = request.form.get('idToken')
    # csrfToken = request.form.get('csrfToken')

    try:
      # To ensure that cookies are set only on recently signed in users, check auth_time in
      # ID token before creating a cookie. Also check if user's email is verified.
      decoded_claims = auth.verify_id_token(id_token)
      # Only process if the user signed in within the last 5 minutes and if user's email is verified.
      if time.time() - decoded_claims['auth_time'] < 5 * 60 and decoded_claims['email_verified']:
        # Set session expiration to 5 days.
        expires_in = datetime.timedelta(days=5)
        # Set cookie policy for session cookie.
        expires = datetime.datetime.now() + expires_in
        # Create the session cookie. This will also verify the ID token in the process.
        # The session cookie will have the same claims as the ID token.
        session_cookie = auth.create_session_cookie(id_token, expires_in=expires_in)
        response = jsonify({'status': 'success'})
        response.set_cookie(
            'session_fb', session_cookie, expires=expires, httponly=True, secure=True)
        # Before returning firebase cookie, set server-side user session variables.
        # Get a database reference to our users
        ref = db.reference('users')
        # Get user's data from the database reference
        user_data = ref.order_by_child('email').equal_to(decoded_claims['email']).get()
        user_data = user_data[next(iter(user_data))]
        # Set server-side user session variables
        session['user_details'] = {
          'email': user_data['email'],
          'firstname': user_data['firstname'],
          'lastname': user_data['lastname'],
          'type': user_data['type'],
          'new': user_data['new']
        }
        # Return firebase cookie
        return response
      # User's email is not verified.
      elif not decoded_claims['email_verified']:
        return make_response(jsonify({'code': 'auth/email-not-verified'}), 401)
      # User did not sign in recently. To guard against ID token theft, require
      # re-authentication.
      return abort(401, 'Recent sign in required')
    except auth.InvalidIdTokenError:
      return abort(401, 'Invalid ID token')
    except exceptions.FirebaseError:
      return abort(401, 'Failed to create a session cookie')
  return render_template('signin.html')

@app.route('/signup', methods=['POST', 'GET'])
@signout_required
def signup():
  if request.method == 'POST':
    # Get the ID token sent by the client
    id_token = request.form.get('idToken')
    # csrfToken = request.form.get('csrfToken')
    firstname = request.form.get('firstname')
    lastname = request.form.get('lastname')

    try:
      # To ensure that cookies are set only on recently signed up users, check auth_time in
      # ID token before adding user details to rt-database.
      decoded_claims = auth.verify_id_token(id_token)
      # Only process if the user signed up within the last 5 minutes.
      if time.time() - decoded_claims['auth_time'] < 5 * 60:
        # Add user details to rt-database
        uid = decoded_claims['uid']
        user = auth.get_user(uid)
        # Get a database reference to our users
        ref = db.reference()
        users_ref = ref.child('users')
        users_ref.push({
          'email': user.email,
          'firstname': firstname,
          'lastname': lastname,
          'new': 'true',
          'type': 'student'
        })
        response = jsonify({'status': 'success'})
        return response
      # User did not sign up recently. To guard against ID token theft, require
      # re-authentication.
      return abort(401, 'Recent sign up required')
    except auth.InvalidIdTokenError:
      return abort(401, 'Invalid ID token')
  return render_template('signup.html')

@app.route('/passwordrecovery')
@signout_required
def passwordrecovery():
  return render_template('passwordrecovery.html')

@app.route('/verification')
@signout_required
def verification():
  return render_template('verification.html')

@app.route('/resendverification')
@signout_required
def resendverification():
  return render_template('resendverification.html')

@app.route('/signout')
@signin_required
def logout():
  # Release all user session variables, clear cookie and redirect user to sign in page.
  session.clear()
  response = make_response(redirect('/signin'))
  response.set_cookie('session_fb', expires=0)
  return response

@app.route('/admin')
@signin_required
@admin_required
def admin():
  return render_template('admin.html')

@app.route('/users')
@signin_required
@admin_required
def users():
  # Get a database reference to our users
  ref = db.reference('users').get()
  list_users = []
  for key, value in ref.items():
    list_users.append([key, value['email'], value['firstname'], value['lastname'], value['type']])
  return render_template('users.html', users = list_users)

@app.route('/users/add-users', methods=['POST', 'GET'])
@signin_required
@admin_required
def addUsers():
  if request.method == 'POST':
    # Get the ID token sent by the client
    id_token = request.form.get('idToken')
    # csrfToken = request.form.get('csrfToken')
    firstname = request.form.get('firstname')
    lastname = request.form.get('lastname')
    type = request.form.get('type')

    try:
      # To ensure that the user was recently created, check auth_time in
      # ID token before adding user details to rt-database.
      decoded_claims = auth.verify_id_token(id_token)
      # Only process if the user was created within the last 5 minutes.
      if time.time() - decoded_claims['auth_time'] < 5 * 60:
        # Add user details to rt-database
        uid = decoded_claims['uid']
        user = auth.get_user(uid)
        # Get a database reference to our users
        ref = db.reference()
        users_ref = ref.child('users')
        users_ref.push({
          'email': user.email,
          'firstname': firstname,
          'lastname': lastname,
          'new': 'true',
          'type': type
        })
        response = jsonify({'status': 'success'})
        return response
      # User was not created recently. To guard against ID token theft, require
      # re-authentication.
      return abort(401, 'Recent user creation required')
    except auth.InvalidIdTokenError:
      return abort(401, 'Invalid ID token')
  return render_template('add-users.html')
  # if request.method == 'POST':
  #   firstname = request.form.get('firstname')
  #   lastname = request.form.get('lastname')
  #   email = request.form.get('email')
  #   password = request.form.get('password')

  #   try:
  #     user = auth.create_user(email=email, password=password)
  #     ref = db.reference('users')
  #     ref.push({
  #       'email': email,
  #       'firstname': firstname,
  #       'lastname': lastname,
  #       'new': 'true',
  #       'type': 'student'
  #     })
  #     # payload = json.dumps({
  #     #   "requestType": "VERIFY_EMAIL",
  #     #   "idToken": id_token
  #     # })
  #     # requests.post(rest_api_url, params={"key": FIREBASE_WEB_API_KEY}, data=payload)

  #     return render_template('add-users.html', firstname=firstname, lastname=lastname, email=email, success="Account created")
  #   except auth.EmailAlreadyExistsError:
  #     return render_template('add-users.html', firstname=firstname, lastname=lastname, email=email, error="This email already exists")
  #   except:
  #     return render_template('add-users.html', firstname=firstname, lastname=lastname, email=email, error="There was an error adding this account. Please try again.")
  # return render_template('add-users.html')

    # try:
    #   user = auth.create_user_with_email_and_password(email, password)
    #   data = {
    #     "email": email,
    #     "firstname": firstname,
    #     "lastname": lastname,
    #     "new": "true",
    #     "type": "student"
    #   }
    #   db.child("users").push(data)

    #   auth.send_email_verification(user['idToken'])

    #   return render_template('add-users.html', firstname=firstname, lastname=lastname, email=email, error="false", success="true", successmessage="Account created!")

    # except requests.HTTPError as e:
    #     error_json = e.args[1]
    #     error = json.loads(error_json)['error']['message']
    #     if error == "EMAIL_EXISTS":
    #       return render_template('add-users.html', firstname=firstname, lastname=lastname, email=email, error="true", errormessage="This email already exists!")
    #     else:
    #       return render_template('add-users.html', firstname=firstname, lastname=lastname, email=email, error="true", errormessage=error)
    # except:
    #   return render_template('add-users.html', firstname=firstname, lastname=lastname, email=email, error="true", errormessage="Sorry, we're having trouble completing your request right now. Please try again later.")

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
  
  if session['user_details']['new'] == "true":
    session['user_details']['new'] = "false"
    session.modified = True
    # Update 'new' variable in database
    # Get a database reference to our users
    ref = db.reference('users').get()
    # Get user's data from the database reference
    for user in ref:
      if ref[user]['email'] == session['user_details']['email']:
        db.reference('users').child(user).update({'new': 'false'})
        break
    return render_template('courses.html', videos=videos, new="true")

  else:
    return render_template('courses.html', videos=videos, new="false")

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