import express from "express";

import {
	getProjectList,
	createProject,
	editProject,
} from "../controllers/project";
import authenticate from "../middleware/auth";
import checkDomain from "../middleware/domain";

const router = express.Router();

router.post("/create", authenticate, checkDomain, createProject);
router.post("/update", authenticate, checkDomain, editProject);
router.get("/list", authenticate, getProjectList);

export default router;
