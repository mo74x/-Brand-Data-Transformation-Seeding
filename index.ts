import mongoose from 'mongoose';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { faker } from '@faker-js/faker';
import ExcelJS from 'exceljs';
import * as fs from 'node:fs';
const { Schema } = mongoose;

const brandSchema = new Schema({
	brandName: {
		type: String,
		required: [true, 'Brand name is required'],
		trim: true,
	},
	yearFounded: {
		type: Number,
		required: [true, 'Year founded is required'],
		min: [1600, 'Year founded seems too old'],
		max: [new Date().getFullYear(), 'Year founded cannot be in the future'],
	},
	headquarters: {
		type: String,
		required: [true, 'Headquarters location is required'],
		trim: true,
	},
	numberOfLocations: {
		type: Number,
		required: [true, 'Number of locations is required'],
		min: [1, 'There should be at least one location'],
	},
}, {
	timestamps: true,
	strict: false,
});

const Brand = mongoose.model('Brand', brandSchema);
const MIN_YEAR = 1600;
const MIN_LOCATIONS = 1;

function parseYear(raw: unknown): number | null {
	if (raw == null) return null;
	const n = typeof raw === 'string' ? Number(raw) : (typeof raw === 'number' ? raw : NaN);
	if (Number.isNaN(n) || !Number.isFinite(n)) return null;
	const year = Math.trunc(n);
	if (year < MIN_YEAR || year > new Date().getFullYear()) return null;
	return year;
}

function parseLocations(raw: unknown): number | null {
	if (raw == null) return null;
	const n = typeof raw === 'string' ? Number(raw) : (typeof raw === 'number' ? raw : NaN);
	if (Number.isNaN(n) || !Number.isFinite(n)) return null;
	const loc = Math.trunc(n);
	if (loc < MIN_LOCATIONS) return null;
	return loc;
}

async function main() {
	const uri = process.env['MONGODB'];
	if (!uri) {
		throw new Error('Missing MONGODB env variable');
	}
	await mongoose.connect(uri, { dbName: 'brand-transformation' });
	console.log('Connected to MongoDB');

	const __filename = fileURLToPath(import.meta.url);
	const __dirname = dirname(__filename);
	const jsonPath = join(__dirname, 'brands.json');

	const existingCount = await Brand.countDocuments();
	if (existingCount === 0) {
		const rawJson = readFileSync(jsonPath, 'utf-8');
		const brandsData = JSON.parse(rawJson) as Record<string, unknown>[];

		const docs = brandsData.map((b) => {
			const doc: Record<string, unknown> = { ...b };
			if (
				doc['_id'] &&
				typeof doc['_id'] === 'object' &&
				(doc['_id'] as Record<string, unknown>)['$oid']
			) {
				doc['_id'] = new mongoose.Types.ObjectId(
					(doc['_id'] as Record<string, string>)['$oid'],
				);
			}
			return doc;
		});

		await Brand.collection.insertMany(docs);
		console.log(`Imported ${docs.length} documents from brands.json`);
	} else {
		console.log(`Collection already has ${existingCount} documents, skipping import`);
	}

	const allDocs = await Brand.collection.find({}).toArray();
	console.log(`Transforming ${allDocs.length} documents...\n`);

	for (const doc of allDocs) {
		const raw = doc as Record<string, unknown>;
		const id = raw['_id'] as mongoose.Types.ObjectId;

		let brandName = raw['brandName'];
		if (!brandName || typeof brandName !== 'string' || (brandName as string).trim() === '') {
			const brandObj = raw['brand'];
			if (brandObj && typeof brandObj === 'object' && (brandObj as Record<string, unknown>)['name']) {
				brandName = (brandObj as Record<string, string>)['name'];
			}
		}
		if (typeof brandName !== 'string' || (brandName as string).trim() === '') {
			console.warn(`  Doc ${String(id)}: brandName is missing and cannot be recovered`);
			brandName = 'Unknown Brand';
		}

		let yearFounded = parseYear(raw['yearFounded']);
		if (yearFounded == null) yearFounded = parseYear(raw['yearCreated']);
		if (yearFounded == null) yearFounded = parseYear(raw['yearsFounded']);
		if (yearFounded == null) {
			console.log(`  Doc ${String(id)}: yearFounded not recoverable, using min ${MIN_YEAR}`);
			yearFounded = MIN_YEAR;
		}

		let headquarters = raw['headquarters'];
		if (!headquarters || typeof headquarters !== 'string' || (headquarters as string).trim() === '') {
			if (raw['hqAddress'] && typeof raw['hqAddress'] === 'string') {
				headquarters = raw['hqAddress'];
			}
		}
		if (typeof headquarters !== 'string' || (headquarters as string).trim() === '') {
			console.warn(`  Doc ${String(id)}: headquarters is missing and cannot be recovered`);
			headquarters = 'Unknown';
		}

		let numberOfLocations = parseLocations(raw['numberOfLocations']);
		if (numberOfLocations == null) {
			console.log(`  Doc ${String(id)}: numberOfLocations not recoverable, using min ${MIN_LOCATIONS}`);
			numberOfLocations = MIN_LOCATIONS;
		}

		const knownCorrectFields = new Set(['_id', 'brandName', 'yearFounded', 'headquarters', 'numberOfLocations', 'createdAt', 'updatedAt', '__v']);
		const fieldsToUnset: Record<string, ''> = {};
		for (const key of Object.keys(raw)) {
			if (!knownCorrectFields.has(key)) {
				fieldsToUnset[key] = '';
			}
		}

		const updateOps: Record<string, unknown> = {
			$set: {
				brandName: (brandName as string).trim(),
				yearFounded,
				headquarters: (headquarters as string).trim(),
				numberOfLocations,
			},
		};
		if (Object.keys(fieldsToUnset).length > 0) {
			updateOps['$unset'] = fieldsToUnset;
		}

		await Brand.collection.updateOne({ _id: id }, updateOps);

		const updatedDoc = await Brand.findById(id);
		if (updatedDoc) {
			const validationError = updatedDoc.validateSync();
			if (validationError) {
				console.error(` Validation failed for doc ${String(id)}:`, validationError.message);
			} else {
				console.log(` Doc ${String(id)}: OK → ${updatedDoc.brandName} (${updatedDoc.yearFounded}), HQ: ${updatedDoc.headquarters}, Locations: ${updatedDoc.numberOfLocations}`);
			}
		}
	}

	console.log('\n Transformation complete!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');

	//2.Data Seeding
	console.log('\n Seeding 10 new brand documents...');

	const currentYear = new Date().getFullYear();
	const seedCases = [
		{ caseName: 'Startup', description: 'Recent year, 1 location', data: { brandName: faker.company.name(), yearFounded: faker.number.int({ min: currentYear - 3, max: currentYear }), headquarters: faker.location.city(), numberOfLocations: 1 } },
		{ caseName: 'Tech Giant', description: 'Founded 1990-2010, 1000+ locations', data: { brandName: faker.company.name() + ' Tech', yearFounded: faker.number.int({ min: 1990, max: 2010 }), headquarters: faker.location.city(), numberOfLocations: faker.number.int({ min: 1000, max: 5000 }) } },
		{ caseName: 'Historic Brand', description: 'Founded < 1900, huge locations', data: { brandName: faker.company.name() + ' Legacy', yearFounded: faker.number.int({ min: 1600, max: 1899 }), headquarters: faker.location.city(), numberOfLocations: faker.number.int({ min: 5000, max: 20000 }) } },
		{ caseName: 'Local Business', description: 'Few locations (2-5)', data: { brandName: faker.company.name() + ' Local', yearFounded: faker.number.int({ min: 2000, max: currentYear }), headquarters: faker.location.city(), numberOfLocations: faker.number.int({ min: 2, max: 5 }) } },
		{ caseName: 'International Chain', description: 'Many locations (500-2000)', data: { brandName: faker.company.name() + ' Global', yearFounded: faker.number.int({ min: 1950, max: 2000 }), headquarters: faker.location.city(), numberOfLocations: faker.number.int({ min: 500, max: 2000 }) } },
		{ caseName: 'Mid-size Regional', description: '50-500 locations', data: { brandName: faker.company.name(), yearFounded: faker.number.int({ min: 1980, max: 2010 }), headquarters: faker.location.city(), numberOfLocations: faker.number.int({ min: 50, max: 500 }) } },
		{ caseName: 'Established Modern', description: 'Founded 2010-2020, 10-100 locations', data: { brandName: faker.company.name(), yearFounded: faker.number.int({ min: 2010, max: 2020 }), headquarters: faker.location.city(), numberOfLocations: faker.number.int({ min: 10, max: 100 }) } },
		{ caseName: 'Century-old Corp', description: 'Founded ~1920s, 100-500 locations', data: { brandName: faker.company.name() + ' Corp', yearFounded: faker.number.int({ min: 1920, max: 1930 }), headquarters: faker.location.city(), numberOfLocations: faker.number.int({ min: 100, max: 500 }) } },
		{ caseName: 'Niche Boutique', description: 'Recent, 1-3 locations', data: { brandName: faker.company.name() + ' Boutique', yearFounded: faker.number.int({ min: 2020, max: currentYear }), headquarters: faker.location.city(), numberOfLocations: faker.number.int({ min: 1, max: 3 }) } },
		{ caseName: 'Random Generic', description: 'Completely random valid data', data: { brandName: faker.company.name(), yearFounded: faker.number.int({ min: 1800, max: currentYear }), headquarters: faker.location.city(), numberOfLocations: faker.number.int({ min: 1, max: 1000 }) } },
	];

	const newBrands = seedCases.map(c => c.data);
	await Brand.insertMany(newBrands);
	console.log(' Seeded 10 new brands successfully.');

	console.log('\n Generating Excel report for seed cases...');
	const workbook = new ExcelJS.Workbook();
	const worksheet = workbook.addWorksheet('Seed Cases');

	worksheet.columns = [
		{ header: 'Case Name', key: 'caseName', width: 25 },
		{ header: 'Description', key: 'description', width: 40 },
		{ header: 'Brand Name (Generated)', key: 'brandName', width: 35 },
		{ header: 'Year Founded', key: 'yearFounded', width: 15 },
		{ header: 'Headquarters', key: 'headquarters', width: 25 },
		{ header: 'Number of Locations', key: 'numberOfLocations', width: 20 }
	];

	seedCases.forEach(c => {
		worksheet.addRow({
			caseName: c.caseName,
			description: c.description,
			...c.data
		});
	});
	//export excel report
	const excelPath = join(__dirname, 'seed-cases.xlsx');
	await workbook.xlsx.writeFile(excelPath);
	console.log(` Excel report saved to ${excelPath}`);

	//3.Data Export
	console.log('\n Exporting the Brands collection to JSON...');
	const allBrandsFinal = await Brand.find({}).lean();
	const exportPath = join(__dirname, 'brands-exported.json');
	fs.writeFileSync(exportPath, JSON.stringify(allBrandsFinal, null, 2));
	console.log(` Exported ${allBrandsFinal.length} documents to ${exportPath}`);

	await mongoose.disconnect();
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
