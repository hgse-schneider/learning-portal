firebase.initializeApp({
  apiKey: "AIzaSyDqXS2_WyiFw-resKzcPfCvhsu-vsHIwe4",
  authDomain: "lit-public-learning-portal.firebaseapp.com",
});

// As httpOnly cookies are to be used, do not persist any state client side.
firebase.auth().setPersistence(firebase.auth.Auth.Persistence.NONE);

const email = document.getElementById('email');
const firstname = document.getElementById('firstname');
const lastname = document.getElementById('lastname');
const type = document.getElementById('type');
const success = document.getElementById('success');
const danger = document.getElementById('danger');

// Generated ID token is sent via HTTP POST to the session login endpoint
function postIdTokenToSessionLogin(route, idToken /* , csrfToken */ , firstname, lastname, type) {
  var xhr = new XMLHttpRequest();
  var params = `idToken=${idToken}&firstname=${firstname}&lastname=${lastname}&type=${type}`;
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

// Function to generate a random password
function generatePassword() {
  var password = '';
  var str = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
    'abcdefghijklmnopqrstuvwxyz0123456789@#$';
  for (i = 1; i <= 8; i++) {
    var char = Math.floor(Math.random() * str.length + 1);
    password += str.charAt(char)
  }
  return password;
}

// When the user signs up with email and password.
function addUser() {
  success.innerHTML = "";
  danger.innerHTML = "";

  var email_value = email.value;
  var firstname_value = firstname.value;
  var lastname_value = lastname.value;
  var type_value = type.value;

  firebase.auth().createUserWithEmailAndPassword(email_value, generatePassword()).then(({ user }) => {
    // Get the user's ID token as it is needed to exchange for a session cookie.
    return user.getIdToken().then(idToken => {
      // Session login endpoint is queried and the session cookie is set.
      // CSRF protection should be taken into account.
      // const csrfToken = getCookie('csrfToken') WILL ADDRESS LATER
      return postIdTokenToSessionLogin('/users/add-users', idToken /* , csrfToken */ , firstname_value, lastname_value, type_value);
    });
  }).then(() => {
    // Send an email verification link to the user
    firebase.auth().currentUser.sendEmailVerification();
  }).then(() => {
    // Send an password reset link to the user
    firebase.auth().sendPasswordResetEmail(email_value);
  }).then(() => {
    // Since user is automatically signed in on creation, sign the user out.
    return firebase.auth().signOut();
  }).then(() => {
    success.innerHTML = "Account created. The user will receive follow-up emails to verify their account and set a password.";
  }).catch(e => {
    if (e.code == 'auth/email-already-in-use') {
      danger.innerHTML = "This email address is already in use by another account.";
    } else {
      danger.innerHTML = "There was an error creating this account. Please try again.";
    }
  })
}