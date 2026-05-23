# Brand Transformation Project

This project automates the process of importing, transforming, cleaning, and seeding brand data in a MongoDB database using TypeScript and Mongoose.

## Overview

The script performs three main tasks in a single pipeline:

### 1. Data Transformation
- Connects to a MongoDB database.
- Imports raw brand documents from `brands.json`. The raw data contains intentional schema violations (incorrect field names, invalid types, and unneeded fields).
- Transforms the data in-place to conform to the defined schema (`brands-schema.ts`).
- Recoverable fields (like `yearCreated` or `hqAddress`) are mapped to the correct schema fields (`yearFounded` and `headquarters`).
- Invalid numerical values are safely parsed or fallback to the minimum allowed by the schema.
- Extraneous fields are stripped using MongoDB's `$unset` operation.
- Validates every document against the Mongoose schema post-transformation.

### 2. Data Seeding
- Uses Faker.js to dynamically generate 10 new test brand documents.
- The seed data represents various business profiles (e.g., Startups, Tech Giants, Historic Brands, Local Businesses) to ensure a diverse dataset.
- Inserts the new documents into the MongoDB collection.
- Generates an Excel report (`seed-cases.xlsx`) using ExcelJS, documenting the characteristics of each generated test case.

### 3. Data Export
- Retrieves the fully transformed and seeded collection from the database.
- Exports the final clean dataset to a JSON file (`brands-exported.json`).

## Requirements

- Node.js (v20 or higher recommended)
- MongoDB Cluster (Connection URI required)
- TypeScript

## Setup & Installation

1. Clone the repository or navigate to the project directory.
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Ensure you have a `.env` file in the root directory containing your MongoDB connection string:
   ```env
   MONGODB="mongodb+srv://<username>:<password>@cluster.mongodb.net/"
   ```

## Usage

To run the full transformation, seeding, and export pipeline, execute:

```bash
npm start
```

This command uses Node's native `--env-file` flag and `ts-node` to execute the script directly.

## Project Structure

- `index.ts`: The main execution script containing the logic for all tasks.
- `brands-schema.ts`: The Mongoose schema defining the exact data requirements.
- `brands.json`: The initial source data containing schema errors.
- `package.json`: Project dependencies and scripts.
- `seed-cases.xlsx`: Generated Excel report outlining the seed data logic (generated after running).
- `brands-exported.json`: The final exported clean data collection (generated after running).
