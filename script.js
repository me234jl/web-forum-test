import { createClient } from
'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'
const supabase = createClient(
'https://bgcimxyadtgubxzfhdrt.supabase.co',
'sb_publishable_lCXQlIN6km92AidBgmkCFA_XI80r-wK'
)

// ---------- Elements ----------
const authSection = document.getElementById('authSection');
const appSection = document.getElementById('appSection');
const authForm = document.getElementById('authForm');
const authHeading = document.getElementById('authHeading');
const authSubmit = document.getElementById('authSubmit');
const toggleText = document.getElementById('toggleText');
const toggleLink = document.getElementById('toggleLink');
const authMessage = document.getElementById('authMessage');
const displayNameInput = document.getElementById('displayName');
const currentUser = document.getElementById('currentUser');
const logoutBtn = document.getElementById('logoutBtn');
const form = document.getElementById('messageForm');

let isRegisterMode = false;
let currentUsername = null;
let currentUserId = null;

const BUCKET = 'message-images';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

// ---------- Login / Register toggle ----------
toggleLink.addEventListener('click', function(event) {
  event.preventDefault();
  isRegisterMode = !isRegisterMode;
  setMessage('');
  displayNameInput.hidden = !isRegisterMode;
  displayNameInput.required = isRegisterMode;
  if (isRegisterMode) {
    authHeading.textContent = 'Register';
    authSubmit.textContent = 'Create account';
    toggleText.textContent = 'Already have an account?';
    toggleLink.textContent = 'Log in';
    document.getElementById('password').autocomplete = 'new-password';
  } else {
    authHeading.textContent = 'Log in';
    authSubmit.textContent = 'Log in';
    toggleText.textContent = 'No account yet?';
    toggleLink.textContent = 'Register';
    document.getElementById('password').autocomplete = 'current-password';
  }
});

// ---------- Helper to show messages under the form ----------
function setMessage(text, isSuccess) {
  authMessage.textContent = text;
  authMessage.className = isSuccess ? 'success' : 'error';
}

// ---------- Submit login / register ----------
authForm.addEventListener('submit', async function(event) {
  event.preventDefault();
  setMessage('');

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  if (isRegisterMode) {
    const displayName = displayNameInput.value.trim();
    if (!displayName) {
      setMessage('Please choose a display name.');
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: { data: { username: displayName } }
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    // If email confirmation is switched on in Supabase, there is no session yet
    if (!data.session) {
      setMessage('Almost done! Check your email and click the confirmation link, then log in.', true);
      authForm.reset();
      return;
    }
  } else {
    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });
    if (error) {
      setMessage(error.message);
      return;
    }
  }

  authForm.reset();
  // The UI updates automatically via onAuthStateChange below
});

// ---------- Log out ----------
logoutBtn.addEventListener('click', async function() {
  await supabase.auth.signOut();
});

// ---------- Update UI when login state changes ----------
function updateUI(session) {
  if (session) {
    currentUserId = session.user.id;
    currentUsername = session.user.user_metadata.username || 'unknown';
    currentUser.textContent = currentUsername;
    authSection.hidden = true;
    appSection.hidden = false;
  } else {
    currentUsername = null;
    currentUserId = null;
    authSection.hidden = false;
    appSection.hidden = true;
  }
}

supabase.auth.onAuthStateChange(function(event, session) {
  updateUI(session);
});

// ---------- Post a message (logged-in users only) ----------
form.addEventListener('submit', async function(event) {
  event.preventDefault();
  if (!currentUsername) {
    alert('Please log in first.');
    return;
  }

  const title = document.getElementById('title').value;
  const message = document.getElementById('message').value;
  const file = document.getElementById('image').files[0];
  const postBtn = document.getElementById('postBtn');

  // Check the picture before uploading
  if (file) {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(file.type)) {
      alert('Please choose a JPG, PNG, GIF or WebP image.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      alert('That image is too big. The limit is 5 MB.');
      return;
    }
  }

  postBtn.disabled = true;
  postBtn.textContent = file ? 'Uploading...' : 'Posting...';

  let imageUrl = null;
  let imagePath = null;

  // Upload the picture first (if there is one)
  if (file) {
    const ext = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
    imagePath = currentUserId + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(imagePath, file, { contentType: file.type });

    if (uploadError) {
      console.error(uploadError);
      alert('The image could not be uploaded. Please try again.');
      postBtn.disabled = false;
      postBtn.textContent = 'Post message';
      return;
    }

    imageUrl = supabase.storage.from(BUCKET).getPublicUrl(imagePath).data.publicUrl;
  }

  const { error } = await supabase
    .from('messages')
    .insert([
      {
        title: title,
        message: message,
        author: currentUsername,
        image_url: imageUrl
      }
    ]);

  postBtn.disabled = false;
  postBtn.textContent = 'Post message';

  if (error) {
    alert('Something went wrong!');
    console.error(error);
    // Don't leave an orphaned picture behind if the post failed
    if (imagePath) await supabase.storage.from(BUCKET).remove([imagePath]);
  } else {
    alert('Your message has been submitted!');
    form.reset();
    loadMessages();
  }
});

// ---------- Load messages (public) ----------
async function loadMessages() {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) {
    console.error(error)
    return
  }
  const container = document.getElementById('messages');
  container.innerHTML = '';

  if (data.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No messages yet. Log in and post the first one.';
    container.appendChild(empty);
    return;
  }

  data.forEach(item => {
    const post = document.createElement('article');
    post.className = 'post';

    // Left column: coloured avatar orb + name
    const poster = document.createElement('aside');
    poster.className = 'poster';
    const orb = document.createElement('div');
    orb.className = 'orb';
    orb.style.setProperty('--hue', hueFromName(item.author));
    const initial = document.createElement('span');
    initial.textContent = (item.author || '?').charAt(0).toUpperCase();
    orb.appendChild(initial);
    const name = document.createElement('span');
    name.className = 'poster-name';
    name.textContent = item.author;
    poster.append(orb, name);

    // Right column: title, text, date
    const body = document.createElement('div');
    body.className = 'post-body';
    const title = document.createElement('h3');
    title.textContent = item.title;
    const message = document.createElement('p');
    message.textContent = item.message;
    const time = document.createElement('time');
    time.dateTime = item.created_at;
    time.textContent = new Date(item.created_at).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
    body.append(title, message);

    // Optional picture (click to open full size)
    if (item.image_url) {
      const link = document.createElement('a');
      link.href = item.image_url;
      link.target = '_blank';
      link.rel = 'noopener';
      const img = document.createElement('img');
      img.className = 'post-image';
      img.src = item.image_url;
      img.alt = 'Picture attached to "' + item.title + '"';
      img.loading = 'lazy';
      link.appendChild(img);
      body.appendChild(link);
    }

    body.appendChild(time);

    post.append(poster, body);
    container.appendChild(post);
  });
}

// Picks a stable colour for each poster based on their name
function hueFromName(name) {
  let hash = 0;
  for (const ch of String(name)) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}

loadMessages();
