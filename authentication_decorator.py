from flask import session, redirect, request, url_for, make_response
from functools import wraps
import firebase_setup
from firebase_setup import credentials, auth, exceptions, db

def signin_required(f):
  @wraps(f)
  def decorated_function(*args, **kwargs):
    session_cookie = request.cookies.get('session_fb')
    if not session_cookie:
      # Session cookie is unavailable. Force user to login.
      return redirect(url_for('signin'))
    # Verify the session cookie. In this case an additional check is added to detect
    # if the user's Firebase session was revoked, user deleted/disabled, etc.
    try:
      auth.verify_session_cookie(session_cookie, check_revoked=True)
      return f(*args, **kwargs)
    except auth.InvalidSessionCookieError:
      # Session cookie is invalid, expired or revoked. 
      # Release all user session variables, clear cookie and force user to sign in.
      session.clear()
      response = make_response(redirect('/signin'))
      response.set_cookie('session_fb', expires=0)
      return response
  return decorated_function

def signout_required(f):
  @wraps(f)
  def decorated_function(*args, **kwargs):
    session_cookie = request.cookies.get('session_fb')
    if session_cookie:
      # Session cookie is available. Direct user to their dashboard.
      return redirect(url_for('courses'))
    return f(*args, **kwargs)
  return decorated_function

def admin_required(f):
  @wraps(f)
  def decorated_function(*args, **kwargs):
    type = dict(session).get('user_details', None).get('type', None)
    if type == "admin":
      return f(*args, **kwargs)
    return redirect(url_for('index'))
  return decorated_function