export type NotificationType = "Event" | "Result" | "Placement";

export type Notification = {
  ID: string;
  Type: NotificationType;
  Message: string;
  Timestamp: string;
};

export type NotificationsResponse = {
  notifications: Notification[];
};
