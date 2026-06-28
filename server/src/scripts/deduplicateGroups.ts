import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { connectDB } from "../config/db";
import { Company } from "../models/Company";
import { AccountGroup } from "../models/AccountGroup";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function runDeduplication() {
  await connectDB();

  try {
    const companies = await Company.find();
    console.log(`Found ${companies.length} companies to check for duplicate groups.`);

    for (const company of companies) {
      const groups = await AccountGroup.find({ companyId: company._id }).sort({ createdAt: 1 });
      const seenNames = new Set<string>();
      let duplicateCount = 0;

      for (const group of groups) {
        const normalizedName = group.groupName.trim().toUpperCase();
        if (seenNames.has(normalizedName)) {
          // This is a duplicate! Delete it.
          console.log(`Deleting duplicate group: "${group.groupName}" (ID: ${group._id}) for company ${company.companyName}`);
          await AccountGroup.deleteOne({ _id: group._id });
          duplicateCount++;
        } else {
          seenNames.add(normalizedName);
        }
      }
      if (duplicateCount > 0) {
        console.log(`Removed ${duplicateCount} duplicate groups for ${company.companyName}.`);
      }
    }

    console.log("Deduplication completed successfully!");

  } catch (error) {
    console.error("Deduplication failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Database connection closed.");
  }
}

runDeduplication();
