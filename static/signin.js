firebase.initializeApp({
  apiKey: "AIzaSyDqXS2_WyiFw-resKzcPfCvhsu-vsHIwe4",
  authDomain: "lit-public-learning-portal.firebaseapp.com",
});

// As httpOnly cookies are to be used, do not persist any state client side.
firebase.auth().setPersistence(firebase.auth.Auth.Persistence.NONE);

const email = document.getElementById('email');
const password = document.getElementById('password');
const danger = document.getElementById('danger');

// Generated ID token is sent via HTTP POST to the session login endpoint
function postIdTokenToSessionLogin(route, idToken /* , csrfToken */ ) {
  var xhr = new XMLHttpRequest();
  var params = `idToken=${idToken}`;
  xhr.open('POST', route);
  xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
  return new Promise(function(resolve, reject) {
    xhr.onreadystatechange = function() {
      if (xhr.readyState == 4 && xhr.status == 200) {
        resolve();
      } else if (xhr.readyState == 4) {
        reject({ code: JSON.parse(xhr.response).code });
      }
    }
    return xhr.send(params);
  });
}

// When the user signs in with email and password.
function signIn() {
  danger.innerHTML = "";

  var email_value = email.value;
  var password_value = password.value;

  firebase.auth().signInWithEmailAndPassword(email_value, password_value).then(({ user }) => {
    // Get the user's ID token as it is needed to exchange for a session cookie.
    return user.getIdToken().then(idToken => {
      // Session login endpoint is queried and the session cookie is set.
      // CSRF protection should be taken into account.
      // const csrfToken = getCookie('csrfToken') WILL ADDRESS LATER
      return postIdTokenToSessionLogin('/signin', idToken /* , csrfToken */ );
    });
  }).then(() => {
    // A page redirect would suffice as the persistence is set to NONE.
    return firebase.auth().signOut();
  }).then(() => {
    window.location.assign('/courses');
  }).catch(e => {
    if (e.code == 'auth/wrong-password') {
      danger.innerHTML = "Your email or password is incorrect.";
    } else if (e.code == 'auth/user-not-found') {
      danger.innerHTML = "There is no account set up for this email. Did you mean to <a href='/signup'>sign up</a>?";
    } else if (e.code == 'auth/email-not-verified') {
      danger.innerHTML = "You haven't verified your email yet! <a href='/resendverification'>Resend verification link</a>?";
    } else {
      danger.innerHTML = "There was an error signing you in. Please try again.";
    }
  })
}