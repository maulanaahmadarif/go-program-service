import express from "express";

import {
	getProjectList,
	createProject,
	editProject,
} from "../controllers/project";
import authenticate from "../middleware/auth";
import checkDomain from "../middleware/domain";

const router = express.Router();

router.post("/create", authenticate, createProject);
router.post("/update", authenticate, editProject);
router.get("/list", authenticate, getProjectList);

export default router;
