firebase.initializeApp({
  apiKey: "AIzaSyDqXS2_WyiFw-resKzcPfCvhsu-vsHIwe4",
  authDomain: "lit-public-learning-portal.firebaseapp.com",
});

const email = document.getElementById('email');
const success = document.getElementById('success');
const danger = document.getElementById('danger');

// When the user submits their email.
function passwordRecovery() {
  success.innerHTML = "";
  danger.innerHTML = "";

  var email_value = email.value;

  firebase.auth().sendPasswordResetEmail(email_value).then(function() {
    // Email sent
    success.innerHTML = "Verification link has been sent! Continue to <a href='/signin'><u>sign in</u></a>";
  }).catch(e => {
    if (e.code == 'auth/user-not-found' || e.code == 'auth/invalid-email') {
      danger.innerHTML = "There is no account set up for this email. Did you mean to <a href='/signup'>sign up</a>?";
    } else {
      danger.innerHTML = "There was an error creating your link. Please try again.";
    }
  });
}