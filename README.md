# Asufa Hebrew RTL Quote Generator

Minimal local Node.js MVP for generating an A4 Hebrew RTL PDF quote for Asufa package offers.

## What It Includes

- `products.json` with 5 sample package offers
- `components.json` with reusable product/component items for package contents
- `saved-quotes.json` with quotes saved from the quote builder
- `quote-data.json` sample quote input
- Local Asufa logo and package images under `assets/`
- HTML and CSS template under `templates/`
- Puppeteer PDF generator at `src/generateQuote.js`
- PDF output at `output/quote.pdf`

## Setup

Install dependencies:

```bash
npm install
```

Puppeteer uses a project-local browser cache at `.cache/puppeteer`, so a broken global browser cache will not affect this project.

If Puppeteer reports that Chrome is missing, install the browser cache once:

```bash
npx puppeteer browsers install chrome
```

Generate the sample quote:

```bash
npm run generate
```

The PDF will be created at:

```text
output/quote.pdf
```

## Local HTML Interfaces

Run the local server:

```bash
npm run products
```

Then open the package bank:

```text
http://localhost:3000/products
```

Or open the quote builder:

```text
http://localhost:3000/quote
```

There are three simple local pages:

- `http://localhost:3000/products`: create, edit, delete, and order package offers.
- `http://localhost:3000/components`: create and edit reusable product/component lines that can be added into packages.
- `http://localhost:3000/quote`: create a quote from the package bank.
- `http://localhost:3000/quotes`: open saved quotes, edit them, duplicate them, or open their latest PDF.

The package bank lets you enter:

- package name
- package image
- package contents, one item per line, manually or from the reusable product bank
- price before VAT
- optional category

When you click `שמור מארז`, the interface saves:

- the image under `assets/products`
- the package row inside `products.json`

Each existing package card also has:

- `ערוך`: loads the package back into the form so you can fix text, price, category, or replace the image
- `מחק`: removes the package from `products.json` and removes its local image

Use `טבלה וסדר` in the package bank to switch to table view and move packages up or down. The saved order is also the order shown in the bank and quote builder.

In the `מה יש במארז` field, write each package item on a separate line. Each line appears as a bullet in the package bank, quote builder, and PDF. Use the `B` button or wrap text with `**` to show it in bold, for example `דבש **בוטיק** 130 גרם`.

The `בנק מוצרים` page stores reusable product/component lines, such as honey, diffuser, greeting card, or branded box. The table is sorted alphabetically in Hebrew. Add or edit a reusable product there, including bold details, then use `הוסף מוצר מתוך הבנק` while creating a package to insert it into `מה יש במארז`.

The quote builder page lets you:

- enter customer/company details
- enter optional customer email
- enter optional customer phone
- search and choose packages from `products.json`
- set one shared quantity for all selected packages
- choose default note bullets and add optional extra notes
- choose whether to show or hide the general totals box
- generate a PDF and save the quote under `saved-quotes.json`

Every generated quote is saved with the customer/company name. The latest PDF for each saved quote is stored under `output/quotes`, so old saved quote PDFs are not overwritten by the next quote.

On Windows, if PowerShell blocks `npm`, run:

```bash
npm.cmd run products
```

## Deploy To Netlify

This project now includes a Netlify setup:

- `netlify.toml` defines the build, redirects, and serverless functions.
- `netlify/functions/api.js` serves the same `/api/products`, `/api/components`, and `/api/quotes` endpoints online.
- Netlify Blobs stores packages, uploaded images, and generated quote files online.
- `npm run build` copies local assets into `public/assets` for the deployed site.

Recommended Netlify flow:

1. Push this folder to a GitHub repository.
2. In Netlify, choose `Add new site` and import the repository.
3. Netlify should read `netlify.toml` automatically.
4. Confirm these settings if Netlify asks:

```text
Build command: npm run build
Publish directory: public
Functions directory: netlify/functions
```

After deploy, open:

```text
https://your-site.netlify.app/quote
https://your-site.netlify.app/products
https://your-site.netlify.app/components
https://your-site.netlify.app/quotes
```

On first load, the online banks are seeded from `products.json`, `components.json`, and `saved-quotes.json`. After that, package edits, reusable product edits, package order, saved quotes, and uploaded images are stored in Netlify Blobs, so they do not require a database.

Large quotes may open as a print-ready quote page instead of a direct PDF. In that case, click `פתח הצעה להדפסה`, then use browser print and choose `Save as PDF`.

Because this is an internal tool, protect the Netlify site before sharing it with others. The simplest options are Netlify password protection, Netlify Identity, or putting it behind a private team-only URL.

## Edit Quote Data

Update `quote-data.json`:

- `recipientCompany`: customer or company name
- `contactPerson`: optional contact person
- `customerPhone`: optional customer phone shown in the PDF
- `customerEmail`: optional customer email shown in the PDF
- `quoteDate`: quote date in `YYYY-MM-DD` format
- `notes`: an array of note bullets shown in the PDF
- `selectedProducts`: package IDs and quantities
- `contactDetails`: Asufa contact details for the footer

Example selected package:

```json
{
  "id": "asufa-home-package",
  "quantity": 3
}
```

Example notes:

```json
[
  "כל המחירים המוצגים בהצעה הם ללא מע״מ.",
  "תינתן הנחה של 10% למי שסוגר את ההזמנה עד 15.7.2026."
]
```

## Edit Package Data

Update `products.json` to add or change package offers. Each package should include:

- `id`
- `productName`
- `shortDescription`
- `unitPrice`
- `imagePath`
- `category`

Images are loaded locally from `assets/products`. The template crops them with CSS so they stay neat and do not stretch.

## Edit Reusable Package Components

Update `components.json` or use the `בנק מוצרים למארזים` interface at:

```text
http://localhost:3000/components
```

Each reusable component should include:

- `id`
- `componentName`
- `defaultText`
- `category`

`defaultText` is the line inserted into `מה יש במארז`, and it can include `**bold text**`.

## Optional Custom Input or Output

You can pass a different quote input file or output path:

```bash
node src/generateQuote.js quote-data.json output/quote.pdf
```

## Notes

- No database is needed.
- VAT is set in `src/generateQuote.js` as `0.18`.
- The logo currently uses a local PNG converted from the supplied Asufa Hebrew logo PDF.
