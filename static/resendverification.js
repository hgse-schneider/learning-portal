firebase.initializeApp({
  apiKey: "AIzaSyDqXS2_WyiFw-resKzcPfCvhsu-vsHIwe4",
  authDomain: "lit-public-learning-portal.firebaseapp.com",
});

// As httpOnly cookies are to be used, do not persist any state client side.
firebase.auth().setPersistence(firebase.auth.Auth.Persistence.NONE);

const email = document.getElementById('email');
const password = document.getElementById('password');
const danger = document.getElementById('danger');

// When the user signs in with email and password.
function resendVerification() {
  danger.innerHTML = "";

  var email_value = email.value;
  var password_value = password.value;

  firebase.auth().signInWithEmailAndPassword(email_value, password_value).then(({ user }) => {
    // Send an email verification link to the user
    user.sendEmailVerification();
  }).then(() => {
    // A page redirect would suffice as the persistence is set to NONE.
    return firebase.auth().signOut();
  }).then(() => {
    window.location.assign('/verification');
  }).catch(e => {
    if (e.code == 'auth/wrong-password') {
      danger.innerHTML = "Your email or password is incorrect.";
    } else if (e.code == 'auth/user-not-found') {
      danger.innerHTML = "There is no account set up for this email. Did you mean to <a href='/signup'>sign up</a>?";
    } else {
      danger.innerHTML = "There was an error sending you a verification link. Please try again.";
    }
  })
}