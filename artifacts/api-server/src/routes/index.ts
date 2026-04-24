import { Router, type IRouter } from "express";
import healthRouter from "./health";
import patientsRouter from "./patients";
import i18nRouter from "./i18n";

const router: IRouter = Router();

router.use(healthRouter);
router.use(patientsRouter);
router.use(i18nRouter);

export default router;
