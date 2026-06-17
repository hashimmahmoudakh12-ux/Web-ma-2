# Al Maqam Al Mahmoud — Website

A premium multi-page website for **Al Maqam Al Mahmoud** (المقام المحمود), an Islamic nasheed group.

---

## File Structure

```
al-maqam-al-mahmoud/
├── index.html       ← Home page
├── booking.html     ← Interactive booking calendar + form
├── contact.html     ← Contact information + form
├── style.css        ← All styles (single file)
├── script.js        ← All JS: nav, calendar, forms
└── README.md
```

---

## GitHub Pages Deployment

1. Create a new GitHub repository.
2. Upload all five files (`index.html`, `booking.html`, `contact.html`, `style.css`, `script.js`).
3. Go to **Settings → Pages**.
4. Under **Source**, select `main` branch and `/ (root)`.
5. Click **Save**. Your site will be live at `https://yourusername.github.io/your-repo-name/`.

---

## Customisation Guide

### Update Availability Dates

Open `script.js` and find the `UNAVAILABLE` set near the top of `initCalendar()`:

```js
const UNAVAILABLE = new Set([
  '2026-06-20',
  '2026-07-04',
  // Add or remove dates in YYYY-MM-DD format
]);
```

Dates not in this set (and not in the past) will appear green and bookable.

---

### Embed an Instagram Reel

1. Go to the post on [instagram.com](https://instagram.com).
2. Click the three-dot menu → **Embed**.
3. Copy the `<blockquote>` + `<script>` snippet.
4. In `index.html`, find the comment block that says `HOW TO EMBED AN INSTAGRAM REEL` and replace the placeholder `<div>` with your snippet.

---

### Connect the Booking Form (Google Forms)

1. Create a Google Form with matching fields.
2. In `booking.html`, update the `<form>` tag:
   ```html
   <form action="https://docs.google.com/forms/d/e/YOUR_FORM_ID/formResponse" method="POST" target="_blank">
   ```
3. Rename each `<input name="...">` to the corresponding Google Form entry ID (e.g. `entry.123456789`).

Alternatively, use **Formspree**:
```html
<form action="https://formspree.io/f/YOUR_ID" method="POST">
```

---

### Connect the Contact Form

Same approach as above, or use **EmailJS**:
1. Include the EmailJS SDK.
2. Replace the `form.addEventListener('submit', ...)` handler in `script.js` with `emailjs.sendForm(...)`.

---

### Update Contact Details

In `contact.html`, update:
- Instagram handle and URL (search for `almaqamalmahmoud`)
- Email address (search for `info@almaqamalmahmoud.com`)

---

### Add Real Photos to the Gallery

In `index.html`, find the `.gallery-grid` section. Replace each `.gallery-item-bg` div with an `<img>` tag:

```html
<div class="gallery-item-bg">
  <img src="images/event-photo.jpg" alt="Description of event" style="width:100%;height:100%;object-fit:cover;" />
</div>
```

Create an `images/` folder in your repository and upload your photos there.

---

## Design System

| Token | Value | Usage |
|-------|-------|-------|
| `--emerald` | `#0B3D2E` | Primary background |
| `--emerald-deep` | `#071F17` | Darker sections |
| `--gold` | `#D4AF37` | Accents, headings, borders |
| `--cream` | `#F8F3E7` | Primary text |
| `--text-body` | `#C8BFA8` | Body text |

**Fonts:** Cinzel (display) · Cormorant Garamond (serif) · Amiri (Arabic) · Inter (UI)

---

## Browser Support

Compatible with all modern browsers (Chrome, Firefox, Safari, Edge). Gracefully degrades on older browsers.

---

*Built with pure HTML, CSS, and JavaScript — no frameworks, no dependencies, no build step required.*
