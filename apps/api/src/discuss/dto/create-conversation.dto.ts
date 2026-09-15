import { ApiProperty } from "@nestjs/swagger";
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsUUID,
} from "class-validator";

import { ConversationType } from "../../generated/prisma/client.js";

/** Direct or group only - a channel is created through its own endpoint,
 * since it needs a different permission and owner fields a DM/group never has. */
export class CreateConversationDto {
  @ApiProperty({
    enum: [ConversationType.DIRECT, ConversationType.GROUP],
  })
  @IsIn([ConversationType.DIRECT, ConversationType.GROUP])
  type!: typeof ConversationType.DIRECT | typeof ConversationType.GROUP;

  @ApiProperty({
    type: String,
    isArray: true,
    format: "uuid",
    minItems: 1,
    description:
      "The other participants. The acting user is always included and need not be listed.",
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  memberIds!: string[];
}
