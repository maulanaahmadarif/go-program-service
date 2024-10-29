import path from "path";
import { Sequelize } from 'sequelize-typescript';
import config from "../config/config";
import { User } from "../models/User";
import { Product } from "../models/Product";
import { FormType } from "../models/FormType";
import { Form } from "../models/Form";
import { UserAction } from "../models/UserAction";
import { PointTransaction } from "../models/PointTransaction";
import { Redemption } from "../models/Redemption";
import { Company } from "../models/Company";
import { Project } from '../models/Project';

const env = process.env.NODE_ENV || "development";

const dbConfig = (config as any)[env];

export const sequelize = new Sequelize({
  host: dbConfig.host,
  username: dbConfig.username,
  port: dbConfig.port,
  password: dbConfig.password,
  database: dbConfig.database,
  models: [User, Product, FormType, Form, UserAction, PointTransaction, Redemption, Company, Project],
  dialect: dbConfig.dialect,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false, // Disable strict SSL for testing (use with caution in production)
    },
  }
});