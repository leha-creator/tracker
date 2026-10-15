import type { StatusCategory, StatusColor } from '../../models';

export interface ProjectStatusDto {
  id: string;
  name: string;
  category: StatusCategory;
  color: StatusColor;
  position: number;
}
