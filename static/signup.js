firebase.initializeApp({
  apiKey: "AIzaSyDqXS2_WyiFw-resKzcPfCvhsu-vsHIwe4",
  authDomain: "lit-public-learning-portal.firebaseapp.com",
});

// As httpOnly cookies are to be used, do not persist any state client side.
firebase.auth().setPersistence(firebase.auth.Auth.Persistence.NONE);

const email = document.getElementById('email');
const password = document.getElementById('password');
const firstname = document.getElementById('firstname');
const lastname = document.getElementById('lastname');
const danger = document.getElementById('danger');

// Generated ID token is sent via HTTP POST to the session login endpoint
function postIdTokenToSessionLogin(route, idToken /* , csrfToken */ , firstname, lastname) {
  var xhr = new XMLHttpRequest();
  var params = `idToken=${idToken}&firstname=${firstname}&lastname=${lastname}`;
  xhr.open('POST', route);
  xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
  return new Promise(function(resolve, reject) {
    xhr.onreadystatechange = function() {
      if (xhr.readyState == 4 && xhr.status == 200) {
        resolve();
      } else if (xhr.readyState == 4) {
        reject("Invalid http return status");
      }
    }
    return xhr.send(params);
  });
}

// When the user signs up with email and password.
function signUp() {
  danger.innerHTML = "";

  var email_value = email.value;
  var password_value = password.value;
  var firstname_value = firstname.value;
  var lastname_value = lastname.value;

  firebase.auth().createUserWithEmailAndPassword(email_value, password_value).then(({ user }) => {
    // Get the user's ID token as it is needed to exchange for a session cookie.
    return user.getIdToken().then(idToken => {
      // Session login endpoint is queried and the session cookie is set.
      // CSRF protection should be taken into account.
      // const csrfToken = getCookie('csrfToken') WILL ADDRESS LATER
      return postIdTokenToSessionLogin('/signup', idToken /* , csrfToken */ , firstname_value, lastname_value);
    });
  }).then(() => {
    // Send an email verification link to the user
    firebase.auth().currentUser.sendEmailVerification();
  }).then(() => {
    // A page redirect would suffice as the persistence is set to NONE.
    return firebase.auth().signOut();
  }).then(() => {
    window.location.assign('/verification');
  }).catch(e => {
    if (e.code == 'auth/email-already-in-use') {
      danger.innerHTML = "This email address is already in use by another account. Did you mean to <a href='/signin'><u>sign in</u></a>?";
    } else {
      danger.innerHTML = "There was an error signing you up. Please try again.";
    }
  })
}