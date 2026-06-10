use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("Campaign not found")]
    CampaignNotFound {},

    #[error("Campaign is not active")]
    CampaignNotActive {},

    #[error("Campaign has ended")]
    CampaignEnded {},

    #[error("Campaign is full")]
    CampaignFull {},

    #[error("Already joined this campaign")]
    AlreadyJoined {},

    #[error("Not a participant")]
    NotParticipant {},

    #[error("Reward already claimed")]
    AlreadyClaimed {},

    #[error("Rewards not yet distributed")]
    NotDistributed {},

    #[error("Rewards already distributed")]
    AlreadyDistributed {},

    #[error("Unauthorized")]
    Unauthorized {},

    #[error("Must send INJ as reward pool")]
    NoFundsSent {},

    #[error("Content already submitted")]
    ContentAlreadySubmitted {},

    #[error("No reward to claim")]
    NoReward {},
}
