from flask import session, redirect, request, url_for
from functools import wraps

def signin_required(f):
  @wraps(f)
  def decorated_function(*args, **kwargs):
    user = dict(session).get('user', None)
    if user:
      return f(*args, **kwargs)
    return redirect(url_for('signin'))
  return decorated_function

def signout_required(f):
  @wraps(f)
  def decorated_function(*args, **kwargs):
    user = dict(session).get('user', None)
    if user:
      return redirect(url_for('courses'))
    return f(*args, **kwargs)
  return decorated_function

def admin_required(f):
  @wraps(f)
  def decorated_function(*args, **kwargs):
    user = dict(session).get('user', None)
    type = dict(session).get('type', None)
    if user and type == "admin":
      return f(*args, **kwargs)
    return redirect(url_for('index'))
  return decorated_function